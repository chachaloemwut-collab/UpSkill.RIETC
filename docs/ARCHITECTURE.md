# Architecture

## Stack

| Layer | เลือกใช้ | หมายเหตุ |
|---|---|---|
| Runtime | Node.js 24 LTS | Next 16 ต้องการ ≥ 20.9 |
| Web + API | Next.js 16 (App Router) + React 19 + TypeScript 6 | Route handlers บาง ๆ, logic อยู่ใน `server/` และ `packages/core` |
| Styling | Tailwind CSS 4 | |
| DB | PostgreSQL 18 + Kysely | **SQL-first**: migration เป็น `.sql` → generate types ด้วย kysely-codegen (ไม่มี schema ซ้ำ 2 ที่) |
| Cache / Lock / Queue | Redis 8 + BullMQ | rate limit, active learning lock, OAuth state, job queue |
| Auth | Opaque session + Argon2id + Google OIDC (arctic + jose) | |
| PDF | Playwright (worker แยก) + qrcode | |
| Validation | Zod 4 | |
| Test | Vitest | |
| Monorepo | pnpm workspaces | |

## โครงสร้าง

```
.
├── apps/
│   ├── web/                       Next.js — UI + API
│   │   └── src/
│   │       ├── app/               หน้าเว็บ + api/**/route.ts (บาง ๆ: validate → เรียก service)
│   │       │   ├── (auth)/        login, register, forgot/reset password, verify-email
│   │       │   ├── courses/[slug] รายละเอียด, lessons/[id] (player), quiz, certificate
│   │       │   ├── instructor/    รายการหลักสูตร + editor
│   │       │   ├── admin/         ระงับ/รับรองหลักสูตร, เพิกถอนใบรับรอง, ผู้ใช้, cheat flags
│   │       │   ├── me/            บัญชี, ชื่อจริง, รหัสผ่าน, ผูก Google
│   │       │   └── verify/[code]  หน้าตรวจสอบสาธารณะ
│   │       ├── components/        UI (client components)
│   │       ├── server/            server-only services (ห้าม import จาก client)
│   │       │   ├── http.ts        route() wrapper: origin/auth/role/zod/rate-limit/error
│   │       │   ├── auth/          session, google, auth.service
│   │       │   ├── learning/      start-session, heartbeat
│   │       │   ├── courses/       catalog, quiz, instructor
│   │       │   ├── certificates/  issue, verify, download
│   │       │   └── admin/
│   │       └── proxy.ts           CSP nonce (Next 16 เปลี่ยนชื่อจาก middleware)
│   └── worker/                    BullMQ: render PDF, recheck YouTube (cron 03:00), ส่งอีเมล, seed
├── packages/
│   ├── core/                      กฎธุรกิจล้วน (ไม่มี IO) + unit tests ← หัวใจของระบบ
│   ├── db/                        migrations/*.sql, generated.ts (commit), Kysely client, migrate runner
│   └── infra/                     env, redis, rate-limit, password, logger, youtube, mailer, storage
├── tests/e2e/                     end-to-end กับ stack จริง (HTTP + Mailpit + DB)
├── infra/
│   ├── postgres/init/             สร้าง DB roles (dev/CI)
│   └── docker/                    web.Dockerfile, worker.Dockerfile (production)
├── scripts/                       setup-env, generate-signing-key
└── docker-compose.yml             postgres, redis, mailpit (dev เท่านั้น)
```

**กฎ dependency:** `apps/* → packages/infra → packages/core` และ `apps/* → packages/db` — `core` ห้าม import อะไรที่ทำ IO
Client component import จาก `@upskill/core/heartbeat`, `/user-agent`, `/youtube` เท่านั้น (entry หลักมี `node:crypto`)

## Flow: การเรียน 1 บท

```
Client                         Web (Next)                         Redis / Postgres
  │ กด Play                      │                                   │
  ├─POST start-session──────────►│ เช็ก enrollment, sequential lock  │
  │                              │ ปิด learning_sessions เก่า        ├─► learning_sessions INSERT
  │                              │ SET learn:active:{uid}            ├─► Redis (แท็บเก่า → 409)
  │◄──── stream_token ───────────┤                                   │
  │                              │                                   │
  ├─POST heartbeat (ทุก 10 วิ)──►│ hash(token) → session             │
  │  {seq, current_second}       │ Redis check-and-refresh           │
  │                              │ BEGIN; SELECT … FOR UPDATE        │
  │                              │ evaluateHeartbeat(state, now())   │ ← packages/core (pure)
  │                              │ UPDATE progress; COMMIT           │
  │◄── {watchedPercent, max} ────┤                                   │
```

## Flow: ใบรับรอง

```
quiz ผ่าน → enrollments.status='completed'
  → ล็อกชื่อจริง (trigger กันแก้)
  → POST certificate/issue: รวมเวลา, สร้าง payload, Ed25519 sign, INSERT (immutable)
  → queue → worker render PDF (sandbox) + QR → /verify/CODE
  → /verify/CODE: verify signature + cross-check DB columns → valid / revoked / tampered
```

## Environment

| ตัวแปร | ความหมาย |
|---|---|
| `NODE_ENV` | โหมด build ของ Node/Next เท่านั้น (`next start` ตั้งเป็น production เสมอ) |
| `APP_ENV` | สภาพแวดล้อมจริง `local` / `staging` / `production` — production บังคับ https + YouTube key และปิดการกรอกความยาววิดีโอเอง |
| `APP_ORIGIN` | ถ้าเป็น https → cookie ได้ `Secure` + prefix `__Host-` และ CSP มี `upgrade-insecure-requests` |

ไฟล์ env มีที่เดียวคือ `.env.local` ที่ root (`apps/web/.env.local` เป็น symlink เพราะ Next อ่าน env จากโฟลเดอร์ตัวเองเท่านั้น)

## งานที่ควรทำต่อก่อน production

- Object storage (S3/GCS, private bucket) แทน disk สำหรับ PDF — interface อยู่ที่ `packages/infra/src/storage.ts`
- ทดสอบ player บนอุปกรณ์จริง: iOS Safari, Android Chrome, iPad Split View, LINE/Facebook in-app browser
- Deploy: reverse proxy ที่ตั้ง `X-Real-IP`, TLS, Secret Manager, backup DB
- Monitoring/alert: verify ผล `tampered`, อัตรา `anticheat_events`, job ที่ fail ใน BullMQ
