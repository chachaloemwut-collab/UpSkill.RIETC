#!/usr/bin/env bash
# Upload channel for hosting "มะลิ (Jasmine)" (SFTP only; the hosting admin starts the containers).
#
#   scripts/deploy-jasmine.sh init         create deploy/jasmine/secrets/{.env,sftp.env} (generated secrets, git-ignored)
#   scripts/deploy-jasmine.sh check        typecheck + lint + tests before shipping
#   scripts/deploy-jasmine.sh stage        build the upload bundle in dist/deploy/jasmine (code only, no secrets)
#   scripts/deploy-jasmine.sh ls           test the SFTP login and list /files
#   scripts/deploy-jasmine.sh upload       stage + push the bundle to /files (never deletes remote files)
#   scripts/deploy-jasmine.sh upload-env   push deploy/jasmine/secrets/.env to /files/.env (only when it changed)
#   scripts/deploy-jasmine.sh upload-manifest <file>  upload jasmine-release.json via .tmp + rename
#   scripts/deploy-jasmine.sh deploy       upload + ask the server's deployer to rebuild, then wait for the result
#   scripts/deploy-jasmine.sh logs         show the last deploy result and log from the server
#   scripts/deploy-jasmine.sh status       what is on the server (RELEASE) and whether the public site answers
#
# Needs: lftp (brew install lftp), rsync, node 24.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS="$ROOT/deploy/jasmine/secrets"
STAGE="$ROOT/dist/deploy/jasmine"
REMOTE_DIR="/files"

die() { echo "✗ $*" >&2; exit 1; }
info() { echo "→ $*"; }

load_sftp() {
  [[ -f "$SECRETS/sftp.env" ]] || die "missing $SECRETS/sftp.env — run: scripts/deploy-jasmine.sh init"
  # shellcheck disable=SC1091
  source "$SECRETS/sftp.env"
  : "${SFTP_HOST:?}" "${SFTP_PORT:?}" "${SFTP_USER:?}"
  if [[ -z "${SFTP_PASSWORD:-}" ]]; then
    read -rsp "SFTP password for $SFTP_USER: " SFTP_PASSWORD && echo
  fi
  command -v lftp >/dev/null || die "lftp not found (brew install lftp)"
}

# Runs lftp commands on the SFTP server. The password goes through the environment, never argv.
# Host key: trust on first use, then pinned in ~/.ssh/known_hosts (a changed key aborts the upload).
lftp_run() {
  LFTP_PASSWORD="$SFTP_PASSWORD" lftp -c "
    set cmd:fail-exit yes
    set net:max-retries 2
    set net:timeout 20
    set sftp:connect-program 'ssh -a -x -o StrictHostKeyChecking=accept-new'
    open --env-password -u '$SFTP_USER' -p '$SFTP_PORT' 'sftp://$SFTP_HOST'
    $1
  "
}

cmd_init() {
  mkdir -p "$SECRETS" && chmod 700 "$SECRETS"
  if [[ -f "$SECRETS/.env" ]]; then
    info "$SECRETS/.env already exists — left untouched"
  else
    command -v node >/dev/null || die "node not found"
    local key kid priv pub redis
    key="$(node "$ROOT/scripts/generate-signing-key.mjs")"
    kid="$(sed -n 's/^CERT_SIGNING_ACTIVE_KID=//p' <<<"$key")"
    priv="$(sed -n 's/^CERT_SIGNING_PRIVATE_KEY=//p' <<<"$key")"
    pub="$(sed -n 's/^#   "[^"]*":"\(.*\)"$/\1/p' <<<"$key")"
    redis="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("hex"))')"
    local settings_key owner_pw
    settings_key="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
    owner_pw="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(18).toString("base64url"))')"
    local db_url="postgres://jasmine_db:CHANGE_ME@d2dlzpu27ix28y:24632/lpe1831zma9pmg"
    if [[ -n "${JASMINE_DB_PASSWORD:-}" ]]; then
      local enc
      enc="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$JASMINE_DB_PASSWORD")"
      db_url="postgres://jasmine_db:${enc}@d2dlzpu27ix28y:24632/lpe1831zma9pmg"
    fi
    umask 077
    sed \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=$db_url|" \
      -e "s|^DATABASE_MIGRATION_URL=.*|DATABASE_MIGRATION_URL=$db_url|" \
      -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$redis|" \
      -e "s|^REDIS_URL=.*|REDIS_URL=redis://:$redis@redis:6379/0|" \
      -e "s|^SETTINGS_ENCRYPTION_KEY=.*|SETTINGS_ENCRYPTION_KEY=$settings_key|" \
      -e "s|^SYSTEM_OWNER_PASSWORD=.*|SYSTEM_OWNER_PASSWORD=$owner_pw|" \
      -e "s|^CERT_SIGNING_ACTIVE_KID=.*|CERT_SIGNING_ACTIVE_KID=$kid|" \
      -e "s|^CERT_SIGNING_PRIVATE_KEY=.*|CERT_SIGNING_PRIVATE_KEY=$priv|" \
      -e "s|^CERT_PUBLIC_KEYS=.*|CERT_PUBLIC_KEYS='{\"$kid\":\"$pub\"}'|" \
      "$ROOT/deploy/jasmine/env.template" >"$SECRETS/.env"
    info "created $SECRETS/.env (signing key $kid, redis password generated)"
  fi
  if [[ ! -f "$SECRETS/sftp.env" ]]; then
    umask 077
    printf 'SFTP_HOST=202.29.238.30\nSFTP_PORT=11022\nSFTP_USER=jasmine_files\n# Leave empty to be asked every time\nSFTP_PASSWORD=%q\n' "${JASMINE_SFTP_PASSWORD:-}" >"$SECRETS/sftp.env"
    info "created $SECRETS/sftp.env"
  fi
  local left
  left="$(grep -v '^[[:space:]]*#' "$SECRETS/.env" | grep -c 'CHANGE_ME' || true)"
  [[ "$left" == 0 ]] || info "still to fill in $SECRETS/.env: $(grep -o '^[A-Z_]*=.*CHANGE_ME' "$SECRETS/.env" | cut -d= -f1 | sort -u | tr '\n' ' ')"
}

cmd_check() {
  cd "$ROOT"
  pnpm typecheck && pnpm lint && pnpm test
}

cmd_stage() {
  cd "$ROOT"
  info "staging bundle in $STAGE"
  rm -rf "$STAGE" && mkdir -p "$STAGE"
  # Allow-list of what the server needs to build the images; everything else (git, node_modules, builds,
  # local env files, tests, secrets) stays home.
  rsync -a \
    --exclude 'node_modules' --exclude '.next*' --exclude '.turbo' --exclude 'var' --exclude 'dist' --exclude 'coverage' --exclude 'test-results' \
    --exclude '.env*' --exclude '*.tsbuildinfo' --exclude '.DS_Store' --exclude '*.log' \
    --exclude '*.test.ts' --exclude '* 2.*' --exclude 'AGENTS.md' \
    apps packages infra package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .dockerignore .nvmrc \
    "$STAGE/"
  cp deploy/jasmine/compose.yml "$STAGE/compose.yml"
  cp deploy/jasmine/deployer.sh "$STAGE/deployer.sh"
  cp docs/DEPLOY.md "$STAGE/DEPLOY.md"
  {
    echo "built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "commit=$(git rev-parse --short HEAD 2>/dev/null || echo none)"
    echo "uncommitted_changes=$([[ -n "$(git status --porcelain 2>/dev/null)" ]] && echo yes || echo no)"
  } >"$STAGE/RELEASE"

  # Guard: the bundle must not contain any env file or any secret value
  local leaks
  leaks="$(find "$STAGE" -name '.env*' -not -name '.dockerignore' -print)"
  [[ -z "$leaks" ]] || die "env file in bundle: $leaks"
  if [[ -f "$SECRETS/.env" ]]; then
    while IFS='=' read -r k v; do
      [[ "$k" =~ ^(DATABASE_URL|REDIS_PASSWORD|CERT_SIGNING_PRIVATE_KEY|GOOGLE_CLIENT_SECRET|SMTP_URL|EMAIL_WEBHOOK_SECRET|YOUTUBE_API_KEY|SETTINGS_ENCRYPTION_KEY|SYSTEM_OWNER_PASSWORD)$ ]] || continue
      v="${v%\"}"; v="${v#\"}"
      [[ ${#v} -ge 12 && "$v" != *CHANGE_ME* ]] || continue
      if grep -rqF -- "$v" "$STAGE"; then die "secret value of $k found in the bundle"; fi
    done <"$SECRETS/.env"
  fi
  info "bundle ready: $(du -sh "$STAGE" | cut -f1), $(find "$STAGE" -type f | wc -l | tr -d ' ') files ($(sed -n 's/^commit=//p' "$STAGE/RELEASE"), uncommitted: $(sed -n 's/^uncommitted_changes=//p' "$STAGE/RELEASE"))"
}

cmd_ls() {
  load_sftp
  lftp_run "cls -la --sort=name $REMOTE_DIR"
}

cmd_upload() {
  cmd_stage
  load_sftp
  info "uploading to $SFTP_USER@$SFTP_HOST:$REMOTE_DIR (existing remote files are kept; .env is never touched)"
  # No --delete: the server keeps .env and anything the admin adds. Stale code files are harmless because the
  # images are built from the paths listed in the Dockerfiles.
  # Plain mirror: lftp compares mtime+size and uploads files that differ. Do NOT add
  # --ignore-time/--ignore-size here — combined they mean "ignore both comparison
  # criteria", which made lftp decide every file was identical and upload NOTHING
  # (a stale users.service.ts stayed on the server and broke the TypeScript build).
  # Edited files always have newer mtimes than the previous bundle, so they transfer;
  # untouched files are correctly skipped. RELEASE is also put explicitly: it is the
  # version marker the deployer compares against.
  lftp_run "mirror --reverse --parallel=4 --no-perms --exclude-glob .env --verbose=1 '$STAGE' '$REMOTE_DIR'; put '$STAGE/RELEASE' -o '$REMOTE_DIR/RELEASE'"
  info "done. Ask the hosting admin to run in /var/www/hosting/jasmine:  docker compose up -d --build"
}

cmd_upload_env() {
  [[ -f "$SECRETS/.env" ]] || die "missing $SECRETS/.env — run: scripts/deploy-jasmine.sh init"
  ! grep -v '^[[:space:]]*#' "$SECRETS/.env" | grep -q 'CHANGE_ME' || die "fill every CHANGE_ME in $SECRETS/.env first"
  load_sftp
  info "uploading .env to $REMOTE_DIR/.env (mode 600)"
  lftp_run "put '$SECRETS/.env' -o '$REMOTE_DIR/.env'; chmod 600 '$REMOTE_DIR/.env'"
  # env_file changes only apply when the services are recreated — ask the deployer to do it
  local release req
  release="$(sed -n 's/^built_at=//p' "$STAGE/RELEASE" 2>/dev/null)"
  [ -n "$release" ] || release="$(lftp_run "cat $REMOTE_DIR/RELEASE" | sed -n 's/^built_at=//p')"
  req="$(mktemp)"
  printf '%s\n' "$release" >"$req"
  info "requesting service recreation for the new env"
  lftp_run "put '$req' -o '$REMOTE_DIR/deploy-request'"
  rm -f "$req"
}

# Upload, then drop deploy-request (= RELEASE built_at) for the deployer service and wait for deploy-status
cmd_deploy() {
  cmd_upload
  local release req
  release="$(sed -n 's/^built_at=//p' "$STAGE/RELEASE")"
  req="$(mktemp)"
  printf '%s\n' "$release" >"$req"
  info "requesting deploy of release $release"
  lftp_run "put '$req' -o '$REMOTE_DIR/deploy-request'"
  rm -f "$req"
  local deadline=$(( $(date +%s) + 1800 )) status=""
  while (( $(date +%s) < deadline )); do
    sleep 20
    status="$(lftp_run "cat $REMOTE_DIR/deploy-status" 2>/dev/null || true)"
    if grep -q "^release=$release$" <<<"$status"; then
      case "$(sed -n 's/^result=//p' <<<"$status")" in
        ok) info "deployed $release"; cmd_logs_tail; return 0 ;;
        failed|rejected) echo "$status"; cmd_logs_tail; die "deploy did not succeed" ;;
        running) info "building… ($(date +%H:%M:%S))" ;;
      esac
    elif lftp_run "cls $REMOTE_DIR/deploy-request" >/dev/null 2>&1; then
      info "waiting for the deployer to pick up the request… ($(date +%H:%M:%S))"
    fi
  done
  die "no result after 30 minutes: is the deployer service running? (ask the admin: docker compose ps deployer)"
}

cmd_logs_tail() {
  lftp_run "cat $REMOTE_DIR/deploy-log.txt" 2>/dev/null | tail -n 25 | sed 's/^/    /'
}

cmd_logs() {
  load_sftp
  info "deploy-status:"
  lftp_run "cat $REMOTE_DIR/deploy-status" 2>/dev/null | sed 's/^/    /' || info "no deploy has run yet"
  info "deploy-log.txt (last 25 lines):"
  cmd_logs_tail
}

cmd_status() {
  local origin
  origin="$(sed -n 's/^APP_ORIGIN=//p' "$SECRETS/.env" 2>/dev/null)"
  info "local HEAD: $(git -C "$ROOT" rev-parse --short HEAD) ($(git -C "$ROOT" status --porcelain | wc -l | tr -d ' ') uncommitted files)"
  load_sftp
  info "server RELEASE:"
  lftp_run "cat $REMOTE_DIR/RELEASE" | sed 's/^/    /'
  if [[ -n "$origin" ]]; then
    local host code
    host="${origin#https://}"; host="${host%%/*}"
    if dig +short "$host" A | grep -q .; then
      code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$origin/login" || true)"
      info "$origin/login -> HTTP ${code:-no response}"
    else
      info "$host: DNS not set yet (admin has not pointed the domain)"
    fi
  fi
}

cmd_upload_manifest() {
  local manifest="${1:-}"
  [[ -n "$manifest" && -f "$manifest" ]] || die "usage: $0 upload-manifest <path-to-jasmine-release.json>"
  load_sftp
  info "uploading manifest $manifest to $REMOTE_DIR/jasmine-release.json.tmp and renaming..."
  lftp_run "
    rm -f '$REMOTE_DIR/jasmine-release.json'
    put '$manifest' -o '$REMOTE_DIR/jasmine-release.json.tmp'
    mv '$REMOTE_DIR/jasmine-release.json.tmp' '$REMOTE_DIR/jasmine-release.json'
    chmod 644 '$REMOTE_DIR/jasmine-release.json'
  "
  info "manifest uploaded. Hosting will apply the release within ~1 minute."
}

case "${1:-}" in
  init) cmd_init ;;
  check) cmd_check ;;
  stage) cmd_stage ;;
  ls) cmd_ls ;;
  upload) cmd_upload ;;
  upload-env) cmd_upload_env ;;
  upload-manifest) shift; cmd_upload_manifest "$@" ;;
  deploy) cmd_deploy ;;
  logs) cmd_logs ;;
  status) cmd_status ;;
  *) sed -n '2,16p' "$0"; exit 1 ;;
esac
