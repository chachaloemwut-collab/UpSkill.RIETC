#!/bin/sh
# Self-service deploys for hosting "มะลิ (Jasmine)", where developers only have SFTP.
#
# Runs inside the `deployer` service (docker CLI + the host's Docker socket), started once by the hosting admin.
# Protocol, all files in the upload root (/var/www/hosting/jasmine = SFTP /files):
#   developer uploads the code (RELEASE is rewritten) and then writes deploy-request containing RELEASE's built_at
#   deployer sees it, rebuilds and restarts the app services, then writes deploy-status and deploy-log.txt
# It only ever runs the fixed compose commands below: nothing from the request file is executed or interpolated.
set -u

ROOT="${DEPLOYER_ROOT:-/var/www/hosting/jasmine}"
PROJECT=jasmine
APP_SERVICES="migrate web worker redis"
REQUEST="$ROOT/deploy-request"
RUNNING="$ROOT/deploy-running"
STATUS="$ROOT/deploy-status"
LOG="$ROOT/deploy-log.txt"
SELF="$ROOT/deployer.sh"
INTERVAL="${DEPLOYER_INTERVAL:-20}"

owner="$(stat -c '%u:%g' "$ROOT")"
started_hash="$(sha256sum "$SELF" | cut -d' ' -f1)"
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
# Files we write must stay readable and replaceable by the SFTP account that owns the folder
give_back() { chown "$owner" "$@" 2>/dev/null; chmod 644 "$@" 2>/dev/null; }
compose() { docker compose -p "$PROJECT" --project-directory "$ROOT" -f "$ROOT/compose.yml" "$@"; }

write_status() { # result release detail
  printf 'result=%s\nrelease=%s\nfinished_at=%s\ndetail=%s\n' "$1" "$2" "$(now)" "$3" >"$STATUS.tmp"
  mv "$STATUS.tmp" "$STATUS"
  give_back "$STATUS"
}

echo "deployer started $(now), watching $REQUEST"
while :; do
  if [ -f "$REQUEST" ]; then
    # Only the first line, only safe characters: the value is compared, never executed
    wanted="$(head -n1 "$REQUEST" | tr -cd 'A-Za-z0-9:.TZ-')"
    release="$(sed -n 's/^built_at=//p' "$ROOT/RELEASE" 2>/dev/null | tr -cd 'A-Za-z0-9:.TZ-')"
    mv "$REQUEST" "$RUNNING"
    if [ -z "$wanted" ] || [ "$wanted" != "$release" ]; then
      write_status rejected "$release" "request ($wanted) does not match RELEASE ($release); upload may be incomplete"
    else
      write_status running "$release" "started $(now)"
      ( # subshell: its exit code is the deploy result, and `exit` here must not stop the watcher
        echo "== deploy $release started $(now)"
        echo "== docker compose build"
        compose build migrate web worker && \
        echo "== docker compose up" && \
        compose up -d $APP_SERVICES
        rc=$?
        echo "== exit $rc"
        compose ps
        # Only this project's old images: never touches images of other sites on the host
        docker image prune -f --filter "label=com.docker.compose.project=$PROJECT" >/dev/null 2>&1
        echo "== finished $(now)"
        exit "$rc"
      ) >"$LOG" 2>&1
      rc=$?
      give_back "$LOG"
      if [ "$rc" -eq 0 ]; then write_status ok "$release" "services: $APP_SERVICES"; else write_status failed "$release" "exit $rc, see deploy-log.txt"; fi
    fi
    rm -f "$RUNNING"
    # A new deployer.sh takes effect by recreating this container (last step: it ends this process)
    if [ "$(sha256sum "$SELF" | cut -d' ' -f1)" != "$started_hash" ]; then
      echo "deployer.sh changed, recreating deployer"
      compose up -d --no-deps --force-recreate deployer
    fi
  fi
  sleep "$INTERVAL"
done
