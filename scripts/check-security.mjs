#!/usr/bin/env node
// Security gate run by `pnpm lint` (and so by CI on every PR). Fails the build when:
//  1. a password, secret, private key or API key is written into tracked source, or a password is compared with a
//     string literal (the way an owner password once sat in login());
//  2. an API route is not behind an access check: /api/admin needs roles ["admin"], /api/instructor needs the
//     instructor role, /api/partner needs partnerRoute, every other route() states `auth:` explicitly, and the few
//     routes that do their own authentication are listed below with the reason.
// gitleaks (CI) still scans for known token formats; this adds the project-specific rules it cannot know.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const problems = [];

/* ---------- 1. secrets in source ---------- */
const SOURCE = /\.(ts|tsx|js|mjs|cjs|json|ya?ml|sh|sql|toml|env)$/;
const SKIP = [/^tests\//, /\.test\.ts$/, /^docs\//, /\.md$/, /pnpm-lock\.yaml$/, /^\.env\.example$/, /^deploy\/jasmine\/env\.template$/, /^packages\/db\/src\/generated\.ts$/];
// A line may opt out with a comment naming why (e.g. the local dev seed password, which only exists on developer machines)
const ALLOW = /secrets-check:\s*allow\b/;
const PLACEHOLDER = /^(change_?me|changeme|x+|\*+|example|placeholder|your[-_ ].*|<.*>|\$\{.*\}|dev_[a-z_]+password)$/i;

const RULES = [
  { name: "password compared with a string literal", re: /\b\w*(password|passwd|pwd|secret|token)\w*\s*(===|!==|==|!=)\s*["'`]([^"'`]{6,})["'`]/i, group: 3 },
  { name: "string literal compared with a password", re: /["'`]([^"'`]{6,})["'`]\s*(===|!==|==|!=)\s*\w*(password|passwd|secret|token)\b/i, group: 1 },
  { name: "secret assigned from a string literal", re: /\b(password|passwd|secret|api[_-]?key|private[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/i, group: 2 },
  { name: "private key block", re: /-----BEGIN (RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/, group: 0 },
  { name: "UpSkill API key", re: /\bupk_[a-z0-9]{12}_[A-Za-z0-9_-]{40,}\b/, group: 0 },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, group: 0 },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/, group: 0 },
];

for (const f of files) {
  if (!SOURCE.test(f) || SKIP.some((r) => r.test(f))) continue;
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, i) => {
    if (ALLOW.test(line)) return;
    for (const rule of RULES) {
      const m = rule.re.exec(line);
      if (!m) continue;
      const value = m[rule.group] ?? "";
      if (rule.group && PLACEHOLDER.test(value)) continue;
      // Values read from the environment or settings are fine; only literals are flagged
      problems.push(`${f}:${i + 1}  ${rule.name}`);
    }
  });
}

/* ---------- 2. every API route is guarded ---------- */
// Routes that authenticate in their own way, with the reason. Adding to this list needs a review.
const SELF_AUTHENTICATED = {
  "apps/web/src/app/api/mcp/route.ts": "personal API token (Bearer) checked in the handler",
  "apps/web/src/app/api/public/certificate-keys/route.ts": "public signing keys, read-only by design",
  "apps/web/src/app/api/webhooks/email/route.ts": "shared secret, constant-time compare",
  "apps/web/src/app/api/auth/google/callback/route.ts": "OAuth state + PKCE checked in the handler",
  "apps/web/src/app/api/auth/login/form/route.ts": "login form fallback: Origin check + rate limits in the handler",
};

const ROUTE_CALL = /\broute(<[^>]*>)?\(/g;
for (const f of files.filter((p) => /^apps\/web\/src\/app\/api\/.*\/route\.ts$/.test(p))) {
  const text = readFileSync(f, "utf8");
  const calls = (text.match(ROUTE_CALL) ?? []).length;
  const partner = /\bpartnerRoute\(/.test(text);
  if (f.startsWith("apps/web/src/app/api/partner/")) {
    if (!partner) problems.push(`${f}  partner API route must use partnerRoute() (API key + IP allowlist)`);
    continue;
  }
  if (calls === 0) {
    if (!SELF_AUTHENTICATED[f]) problems.push(`${f}  does not use route(); use it or add the file to SELF_AUTHENTICATED with the reason`);
    continue;
  }
  const auths = (text.match(/\bauth:\s*"(required|optional|none)"/g) ?? []).length;
  if (auths < calls) problems.push(`${f}  every route() must state auth: "required" | "optional" | "none"`);
  if (f.startsWith("apps/web/src/app/api/admin/")) {
    const roles = text.match(/\broles:\s*\[[^\]]*\]/g) ?? [];
    if (roles.length < calls || roles.some((r) => !/"admin"/.test(r))) problems.push(`${f}  admin route needs roles: ["admin"] on every handler`);
    else if (roles.some((r) => /"member"/.test(r))) problems.push(`${f}  admin route must not allow members`);
  }
  if (f.startsWith("apps/web/src/app/api/instructor/")) {
    const roles = text.match(/\broles:\s*\[[^\]]*\]/g) ?? [];
    if (roles.length < calls || roles.some((r) => !/"instructor"/.test(r) || /"member"/.test(r))) problems.push(`${f}  instructor route needs roles: ["instructor", "admin"] on every handler`);
  }
}

if (problems.length) {
  console.error(`check-security: ${problems.length} problem(s)\n` + problems.map((p) => `  - ${p}`).join("\n"));
  console.error("\nNever put credentials in code: read them from the environment (packages/infra/src/env.ts) or encrypted settings.");
  process.exit(1);
}
console.log(`check-security: ok (${files.length} tracked files, API routes guarded)`);
