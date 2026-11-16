# คู่มือนักพัฒนา (Developer Handbook) — UpskillReskill.RIETC

เอกสารส่งต่องานสำหรับนักพัฒนาคนถัดไป: ภาพรวมระบบ สภาพแวดล้อม ข้อตกลงโค้ด ขั้นตอน deploy และ
**บทเรียนจากอุบัติเหตุจริง** ที่เคยเกิดขึ้นแล้ว (อ่านหัวข้อ 10 ก่อนลงมือแก้เสมอ)

อัปเดตล่าสุด: 2026-11-16 · สถานะ: production เปิดแล้วที่ `upskillreskill.rietc.ac.th` (APP_ENV=staging)

---

## 1. สถาปัตยกรรมและ Stack

| ชั้น | เทคโนโลยี | หมายเหตุ |
|---|---|---|
| Web | Next.js 16 (App Router, Turbopack), React 19, TypeScript | **Next.js 16 มี breaking change จากรุ่นก่อน** — ก่อนเขียนโค้ดอ่าน `apps/web/AGENTS.md` + ดูตัวอย่างจากโค้ดเดิมก่อนเสมอ |
| Worker | BullMQ 6 + Redis 8 (jobs: email-outbox, assignment-reminders, weekly-summary, video-recheck, cohort-notifications, ops-health) | PDF ใบรับรองใช้ Playwright/Chromium |
| DB | PostgreSQL 18 + Kysely (query builder) | types auto-gen ใน `packages/db/src/generated.ts` |
| Auth | ระบบ custom: Argon2id, session cookie (`__Host-` เมื่อ https), Google OIDC (PKCE), rate-limit บน Redis | ดู [docs/AUTH_BLUEPRINT.md](AUTH_BLUEPRINT.md) — ใช้ซ้ำกับโปรเจกต์อื่นได้ |
| ใบรับรอง | Ed25519 sign (payload v1–v4), canonical JSON, visual digest | ตรวจสอบสาธารณะที่ `/verify/[code]` + `/.well-known/certificate-keys.json` |
| UI | VEC design system (vendored) + Tailwind 4 + ฟอนต์ self-hosted (Prompt/Sarabun/JetBrains Mono ผ่าน `next/font/local`) | ไม่มี Google CDN ตอน runtime — CSP ปิดสนิท |

Monorepo (pnpm workspaces): `apps/web`, `apps/worker`, `packages/{core,db,infra}`, `tests/e2e`

## 2. เริ่มต้นพัฒนา (local)

```bash
# ต้องใช้ Node.js 24 (ค่า default ของเครื่องนี้อาจเป็น v16 → ระบุ PATH เสมอ)
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
corepack enable
pnpm install
pnpm setup:env          # สร้าง .env.local + คีย์ลงนามใบรับรอง (ลิงก์ไป apps/web)
pnpm infra:up           # docker: postgres :55432, redis :6379, mailpit :8025
pnpm db:migrate && pnpm db:seed   # ผู้ใช้ตัวอย่าง 3 คน + หลักสูตรตัวอย่าง
cd apps/worker && ./node_modules/.bin/playwright install chromium && cd ../..  # สำหรับ PDF
pnpm dev                # web :3000 + worker (tsx watch)
```

- บัญชีตัวอย่าง (รหัส `upskill-dev-password`): `admin@upskill.test` / `instructor@upskill.test` / `learner@upskill.test`
- อีเมลทั้งหมด (ยืนยันตัวตน/รีเซ็ตรหัส) ดูที่ Mailpit http://localhost:8025
- คำสั่งตรวจ: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` (ต้องมี web+worker รันอยู่), `pnpm content:check` (ตรวจสำเนาภาษาไทยทุกไฟล์ที่แตะ UI)

## 3. Environment Variables (schema อยู่ที่ `packages/infra/src/env.ts` — getEnv() ตรวจด้วย zod)

| คีย์ | จำเป็น | คำอธิบาย |
|---|---|---|
| `NODE_ENV` | - | development/test/production |
| `APP_ENV` | - | `local`/`staging`/`production` — **production บังคับ https + ต้องมี YOUTUBE_API_KEY และ SMTP จริง** |
| `APP_ORIGIN` | ✅ | ต้นทางของลิงก์อีเมล/redirect/CSRF เช่น `https://upskillreskill.rietc.ac.th` |
| `APP_ALLOWED_ORIGINS` | - | origin เพิ่มเติม (คั่น `,`) สำหรับทดสอบจากโดเมนอื่น |
| `DATABASE_URL` | ✅ | บทบาท app (สิทธิ์จำกัด — **ไม่มี DELETE บางตารางโดยตั้งใจ**) |
| `DATABASE_MIGRATION_URL` | เฉพาะรัน migrate | บทบาท owner — **ไม่ได้อยู่ใน getEnv schema ต้องอ่าน `process.env.DATABASE_MIGRATION_URL` เอง** |
| `REDIS_URL` | ✅ | session/rate-limit/queue + รหัสผ่าน (local: `dev_redis_password`) |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | - | Google OIDC — ตั้งผ่านหน้า admin ได้ด้วย (เก็บเข้ารหัสใน DB ชนะ env) |
| `YOUTUBE_API_KEY` | staging: ไม่บังคับ · production: บังคับ | ตรวจความยาว/embeddable ของวิดีโอ; ไม่มีคีย์ → ใช้ `dev_duration_sec` ได้เฉพาะ non-production |
| `SYSTEM_OWNER_USERNAME/PASSWORD` | username มี default | บัญชีเจ้าของระบบ (username-only, ป้องกันแก้ไขจาก admin); worker bootstrap ให้ตรงกับ env ทุกครั้งที่สตาร์ต |
| `CERT_SIGNING_ACTIVE_KID` + `CERT_SIGNING_PRIVATE_KEY` + `CERT_PUBLIC_KEYS` | ✅ | คีย์ Ed25519 ใบรับรอง — สร้างด้วย `pnpm setup:env` (local) / อยู่ใน `.env` บน server |
| `CERT_STORAGE_DIR/DRIVER` | - | `local` (default) หรือ `s3` (ต้องมี bucket+region) |
| `SETTINGS_ENCRYPTION_KEY` | ✅ | เข้ารหัส secret ที่เก็บใน DB (Google OAuth, SMTP settings) — ห้ามหาย มิฉะนั้น config ทั้งหมดอ่านไม่ออก |
| `SMTP_URL` + `MAIL_FROM` | ✅ (ค่าส่งได้จริงตอน production) | SMTP URL (local: `smtp://127.0.0.1:1025` = mailpit) |
| `EMAIL_WEBHOOK_SECRET` | - | กันปลอม webhook `/api/webhooks/email` |

**ไฟล์ secret อยู่ที่ไหน:** local dev ใช้ `.env.local` (gitignored) · server production เก็บที่ `/files/.env` บน SFTP (mode 600) · สำเนาอัปโหลดฝั่งเราอยู่ที่ `deploy/jasmine/secrets/` (gitignored, ห้าม commit)

## 4. ฐานข้อมูลและ Migration — กติกาเหล็ก

1. Migration เป็น **forward-only SQL** ใน `packages/db/migrations/` ตั้งชื่อ `NNNN_*.sql` เรียงลำดับ
2. ตารางใหม่ต้องมี `GRANT ... TO upskill_app` + `GRANT SELECT ... TO upskill_readonly`
   (บน production มี `MIGRATION_SKIP_ROLE_GRANTS=1` — บทบาทเดียว ระบบข้าม GRANT ให้เอง)
3. หลังรัน `pnpm db:migrate` ต้องรัน `pnpm db:codegen` แล้ว commit `generated.ts` ตามไปด้วย (CI ตรวจว่าไม่ drift)
4. ⚠️ **ห้ามแก้ migration ที่ apply ไปแล้ว** — ระบบเก็บ SHA-256 checksum ใน `schema_migrations`
   และจะ refuse ถ้าเนื้อหาถูกแก้ วิธีที่ถูกคือเขียน migration ใหม่เสมอ
   (ถ้าจำเป็นจริง ๆ เช่นเพิ่ม GRANT ที่ลืม: `UPDATE schema_migrations SET checksum='<sha256 ใหม่>' WHERE name='...'` บนทุกฐานที่ apply แล้ว)
5. ตารางที่ append-only/immutable โดยตั้งใจ: `certificates` (trigger กัน DELETE — ต้อง disable trigger ก่อนล้าง),
   `audit_logs` (reject_mutation), `anticheat_events` (app role ไม่มี DELETE) — อย่า "แก้" ข้อมูลพวกนี้โดยตรง
6. Schema ล่าสุด: 37 ตาราง (migrations 0001–0020) — 0020 ขยาย check `payload_version` เป็น 1–4 (ใบรับรอง v3/v4)

## 5. ข้อตกลงโค้ด (Web)

- API ทุกตัวต้องผ่าน wrapper `route()` ใน `apps/web/src/server/http.ts` — ได้ auth/roles/rate-limit/CSRF-origin/body-validate/requestId ฟรี
- ไฟล์ใน `apps/web/src/server/` ต้องขึ้นต้นด้วย `import "server-only"`
- **ทุกการกลายพันธุ์ต้อง audit**: `audit(db, { action, userId, entityId, entityType, ip })` — action ใหม่เพิ่มใน union ที่ `apps/web/src/server/audit.ts`
- Import ภายใน package ต้องลงท้าย `.ts` (`verbatimModuleSyntax` + `allowImportingTsExtensions`) — ใช้ pattern จากไฟล์เดิม
- TS strict + `exactOptionalPropertyTypes` — optional ต้องไม่ assign `undefined` (ใช้ conditional spread `...(x ? {y: x} : {})`)
- UI: ใช้ component จาก `@/components/ui` (Button/Input/Card/Badge/Alert…) — ปุ่มมี 4 ไซส์ที่**ปรับใหญ่เผื่อจอสัมผัสแล้ว** (sm 36 / md 40 / lg 44 / icon 40px) อย่าลดกลับ
- ฟอนต์: self-hosted ผ่าน `next/font/local` ใน `apps/web/src/app/layout.tsx` — ถ้าเพิ่มฟอนต์ต้องเพิ่มไฟล์ TTF + license ใน `apps/web/src/app/fonts/` ห้ามพึ่ง CDN (CSP ใน `proxy.ts` ไม่ปล่อย)
- MCP: tools 15 ตัว role-gated ที่ `apps/web/src/server/mcp/tools.ts` — เพิ่ม tool ต้องกำหนด `roles` เสมอ
- ห้ามใส่ข้อความภาษาไทยที่หน้า UI โดยไม่รัน `pnpm content:check`

## 6. ระบบสิทธิ์ (RBAC)

`member` (ผู้เรียน) / `instructor` (ผู้สอน — หลักสูตรของตัวเอง) / `admin` (ทั้งหมด) + `is_system_owner` (username-only ป้องกัน lockout)
- **ผู้ใช้ทั่วไปเป็นผู้สอนเองไม่ได้** — มีเฉพาะระบบเชิญของ admin (`instructor_invitations`, แท็บ "เชิญผู้สอน"): ลิงก์ใช้ครั้งเดียว หมดอายุ 7 วัน ยกเลิกได้; สมัครสมาชิกด้วยอีเมลที่ถูกเชิญ → ได้ instructor อัตโนมัติ
- Guardrail: admin คนสุดท้ายที่ active ปลด/ระงับไม่ได้ (`LAST_ADMIN`)
- Checkpoint ระหว่างชม: 10 คะแนน/ข้อ, ผิดหัก 2 คะแนน/ครั้ง, ผิดครบ 3 ครั้ง → ล็อก + ล้างความคืบหน้าบทเรียน (เริ่มเรียนใหม่จึงปลดล็อก) — ตาราง `checkpoint_attempts`

## 7. ใบรับรองดิจิทัล — จุดเปราะที่เคยพัง

1. `payload_version` 1–4 (3 = per-course presentation, 4 = program certificate) — DB check constraint ต้องยอมรับ 1–4 (migration 0020)
2. `verify.service.ts` ต้องส่ง **ทุกฟิลด์ v3** (signerTitle/achievement/visualDigest) ให้ `verifyCertificate` — ขาดอันเดียว = ใบรับรองจริงถูกแจ้งว่า "tampered" (เคยพังมาแล้ว)
3. กัน tamper: visual digest = SHA-256(recipientName\ncourseTitle\ncode) + ลายเซ็น Ed25519; ตรวจไม่ผ่าน → `enqueueAdminAlert` dedup ต่อรหัส
4. PDF render ฝั่ง worker (`render-certificate-pdf`): pattern standard/classic/royal/minimal, พื้นหลังเป็น URL, watermark "ต้นฉบับดิจิทัล · ตรวจสอบออนไลน์"

## 8. Deploy — ระบบปัจจุบัน (GHCR + manifest, ตั้งแต่ 2026-11-16)

**กลไกใหม่ (ใช้ระบบนี้):**
1. โค้ดที่พร้อม deploy ต้องอยู่บน **`main`** + CI เขียว (CI ประกอบด้วย check/e2e/secrets-scan/codeql — e2e รันเฉพาะ push ไป main)
2. สั่ง: `gh workflow run deploy-jasmine.yml --ref main -f migration_compatible=true`
   (ยืนยันก่อนว่า migration ใหม่ใช้ร่วมกับแอปเวอร์ชันที่กำลังรันอยู่ได้ = additive เท่านั้น)
3. Workflow build web+worker (`linux/amd64`) push ไป GHCR `ghcr.io/chachaloemwut-collab/upskill.rietc-{web,worker}` tag = commit SHA
   + สร้าง artifact `jasmine-release.json` (commit + digest ทั้ง 2 อิมเมจ)
4. ดาวน์โหลด artifact แล้วอัปโหลด SFTP เป็น `/files/jasmine-release.json.tmp` → **rename เป็น `/files/jasmine-release.json`** เมื่อครบ → ระบบฝั่ง Hosting (jasmine-release.service/timer) ตรวจและดีพลอยเอง
5. ผลการ deploy ฝั่ง server: `/var/lib/jasmine-deploy/status.json` (ผู้ดูแล Hosting ตรวจได้)

**กลไกเก่า (SFTP bundle + `deploy-request` + deployer) — เลิกใช้แล้ว:** ไฟล์ `deploy-request` ไม่มีผลกับตัวรับใหม่; ไม่ต้องอัปโหลด `compose.yml`/`deployer.sh` ขึ้นไปปล่อยงานอีก สคริปต์ `scripts/deploy-jasmine.sh` ยังเก็บไว้สำหรับงานวินิจฉัย/สำรอง

**Production ปัจจุบัน (มือถือเป็นหลักฐาน):**
- โดเมน: `upskillreskill.rietc.ac.th` → nginx → `127.0.0.1:54744` (web) · DB ภายนอก (internal network, เข้าไม่ถึงจากภายนอก) · โวลุ่ม `certificates` แชร์ web↔worker (uid 10001)
- `.env` บน server: `APP_ENV=staging`, `APP_ORIGIN=https://upskillreskill.rietc.ac.th`, Google OAuth มีค่าแล้ว, **`YOUTUBE_API_KEY` ว่าง**, **`SMTP_URL=smtp.invalid` (ยังไม่ส่งเมลจริง)**, `MIGRATION_SKIP_ROLE_GRANTS=1`
- หลักสูตรจริง 1 หลักสูตร: "การประดิษฐ์กระทงรักษ์โลกและจริยธรรมสิ่งแวดล้อม" (slug `course-889218`, 10 บทเรียน + 20 คำถาม) — แก้เนื้อหาผ่าน instructor API ได้ (ดูหัวข้อ 9)
- ระบบสมัคร: Google login ใช้ได้แล้ว; สมัครด้วยอีเมล+ลืมรหัสผ่านรอ SMTP จริง

## 9. การจัดการข้อมูล production ผ่าน API (ไม่ต้องเข้า DB)

เข้าไม่ได้ตรง ๆ (DB อยู่ internal network) — ใช้บัญชีเจ้าของระบบ (ค่าใน `.env` บน server) ล็อกอินที่ `/api/auth/login` (ฟิลด์ `email` รับ username ได้) แล้วเรียก instructor/admin API ตาม role ตัวอย่างงานที่เคยทำผ่านทางนี้: สร้างหลักสูตร/บทเรียน/ข้อสอบ, เปิด Google OAuth, เชิญผู้สอน, เปลี่ยนบทบาทสมาชิก, export CSV — โครงสร้าง body ดูจาก `z.strictObject` ใน route ไฟล์นั้น ๆ

## 10. ⚠️ บทเรียนจากอุบัติเหตุจริง (ห้ามทำซ้ำ)

| เรื่อง | สิ่งที่เกิดขึ้น | ข้อควรจำ |
|---|---|---|
| lftp mirror flags | `--ignore-time --ignore-size` รวมกันทำให้ lftp **ไม่อัปโหลดอะไรเลย** (ข้ามทุกไฟล์) และ `--only-newer` เคยทำให้ server มีไฟล์ผสมรุ่นเก่า-ใหม่ → build พัง TS2305 | mirror ใช้ **plain `--reverse`** เท่านั้น + หลังอัปโหลดทุกครั้ง **diff ต้นไม้ทั้งชุด** กับ server ว่า 0 ไฟล์ต่าง (เคยทำแล้ว — ทำซ้ำได้) |
| Argon2 ใน standalone | `.next/standalone` ไม่รวม `@node-rs/argon2` → ทุก auth POST ตอบ 500 ตัวเปล่า | ต้องคง `outputFileTracingIncludes` + `publicHoistPattern: ["@node-rs/*"]` ใน next.config/pnpm-workspace ไว้ — อย่าถอด |
| Dockerfile permission | ไฟล์ใน image เป็น root → app user (uid 10001) อ่านไม่ได้ | `COPY --chown=10001:10001` ทุก COPY ใน web/worker Dockerfile |
| DB constraint เก่า | โค้ดเขียน payload v3 แต่ check constraint ยัง (1,2) → ออกใบรับรอง 500 ทั้งระบบ | เปลี่ยนสัญญาโค้ด ต้องตามด้วย migration ขยาย constraint เสมอ (ดู 0020) |
| verify v3 fields | verify ไม่ส่งฟิลด์ v3 → ใบรับรองจริง = "tampered" ทั้งหมด | ดูหัวข้อ 7 ข้อ 2 |
| Migration checksum | แก้ migration ที่ apply แล้ว → migrate refuse ขึ้น "modified after being applied" | เขียน migration ใหม่ หรือ update checksum อย่างมีสติ (หัวข้อ 4.4) |
| rsync/openrsync บน macOS | symlink ขยะชื่อ "… 2" ใน node_modules ทำให้ stage ค้างเป็นชั่วโมง | ถ้า `pnpm deploy upload` ค้างที่ "staging bundle" → `find . -type l -name "* 2" -delete` แล้วลองใหม่ |
| git packfile เสีย | เครื่องโหลดหนัก + หลาย agent commit พร้อมกัน → `.git/objects/pack/*.pack` truncated → push/fetch/merge พัง แต่ commit/status ยังทำงานได้ | วิธีฟื้น: 1) สำรอง working tree (tar) 2) clone ใหม่จาก origin 3) rsync ต้นไม้ทับ 4) commit+push 5) สลับ `.git` กลับ — **ไม่เคยรัน `gc/prune/reset --hard` กับ repo เสียโดยยังไม่สำรอง** |
| Node เวอร์ชัน | default ของเครื่องเป็น v16 → pnpm/next พังเงียบ ๆ | ขึ้นต้นทุกคำสั่งด้วย `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` |
| พอร์ต 3000 | มี `next dev` เดิมรันอยู่แล้ว | อย่าเปิดซ้ำ — ใช้ตัวเดิม (ถ้าตายค่อยเปิด `pnpm --filter @upskill/web dev`) |
| UID ของ bash | ตัวแปร `UID` เป็น readonly ใน bash | อย่าใช้ชื่อ `UID` รับค่าสคริปต์ |

## 11. สาขา (Branch) และการทำงานคู่ขนาน

- `main` = สาย deploy (ทุกอย่างที่เปิดจริงต้อง merge มาที่นี่ + CI เขียว) — ปัจจุบัน tip `bb3e33b`
- `feat/ui-ux-commercial-upgrade` = สายงาน UI/UX (ใช้ merge แบบ fast-forward เข้า main เป็นรอบ ๆ)
- มี **agent คู่ขนาน (codex)** ทำงานใน repo เดียวกัน: commit เอง + push เองบนสาขางาน — ก่อน commit ตรวจ `git status`/`git log` เสมอ, สื่อสารกันผ่าน commit message ที่ชัดเจน, อย่า `reset --hard`/`checkout .` ขณะอีกฝ่ายมีงานค้าง (ไฟล์ใน working tree คือของกลาง)

## 12. งานที่ยังค้างอยู่ (สถานะ ณ วันส่งมอบ)

1. **รอ Hosting**: ตั้ง `read:packages` บน GHCR + ทดสอบ pull → จากนั้นรอบแรกอัปโหลด `jasmine-release.json` (ขั้นตอนหัวข้อ 8)
2. **SMTP จริง** (ส่งเมลยืนยัน/ลืมรหัสผ่าน) — ตอนนี้ placeholder `smtp.invalid`
3. **YOUTUBE_API_KEY จริง** (ตรวจวิดีโออัตโนมัติ) — ตอนนี้ใช้ค่า `dev_duration_sec` จากเอกสารหลักสูตรแทน
4. เลื่อน `APP_ENV` เป็น `production` เมื่อทดสอบครบ (สมัคร→เรียน→สอบ→ใบรับรอง→verify สาธารณะ)
5. `deployer` แบบเก่าบน server (ถ้ายังไม่ได้ปิด) — ไม่จำเป็นอีกต่อไป
6. ตรวจ `docs/GO_LIVE.md` + `docs/PRODUCTION_READINESS.md` ก่อนประกาศเปิดเต็มรูปแบบ

## 13. เอกสารอื่นใน repo

[docs/ARCHITECTURE.md](ARCHITECTURE.md) · [docs/SECURITY.md](SECURITY.md) · [docs/AUTH_BLUEPRINT.md](AUTH_BLUEPRINT.md) (แม่แบบระบบสมาชิกใช้ซ้ำ/ขยาย multi-tenant) · [docs/DEPLOY.md](DEPLOY.md) · [docs/GO_LIVE.md](GO_LIVE.md) · [docs/PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) · [docs/IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
