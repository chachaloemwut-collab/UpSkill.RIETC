# UpskillReskill.RIETC — Architecture

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
│   │       │   ├── (auth)/        layout แบ่งครึ่งจอ: login, register, forgot/reset password, verify-email
│   │       │   └── (lms)/         layout แบบ LMS (sidebar + top bar ตาม role) ครอบทุกหน้าด้านล่าง
│   │       │       ├── page.tsx         แดชบอร์ดผู้เรียน (ล็อกอิน) / landing (guest)
│   │       │       ├── courses/         คลังหลักสูตร (ค้นหา/กรอง) · [slug] รายละเอียด, lessons/[id] (player), quiz, certificate
│   │       │       ├── my-courses/      คอร์สของฉัน + ความคืบหน้า
│   │       │       ├── certificates/    ใบรับรองของฉัน
│   │       │       ├── programs/        หลักสูตรอบรมสาธารณะ · [slug] รายวิชา + รอบอบรม + สมัคร/ยกเลิก
│   │       │       ├── announcements/   ประกาศและกิจกรรมสาธารณะ · [slug] รายละเอียด
│   │       │       ├── instructor/      แดชบอร์ดผู้สอน (admin เห็นทุกรายวิชา) + editor (tabs: บทเรียน/ข้อสอบ/ตั้งค่า)
│   │       │       ├── admin/           สถิติ + tabs: หลักสูตร, cheat flags, ผู้ใช้, เพิกถอนใบรับรอง
│   │       │       │   ├── programs/    หลักสูตรอบรม: ข้อมูล, รายวิชา, รอบอบรม, การเผยแพร่
│   │       │       │   ├── cohorts/     รอบอบรม: ผู้สมัคร (อนุมัติ/ไม่อนุมัติ/CSV) + ตั้งค่าวันที่/ที่นั่ง/เงื่อนไข
│   │       │       │   └── announcements/ ประกาศประชาสัมพันธ์ + ส่งอีเมลครั้งเดียว
│   │       │       ├── me/              ตั้งค่าบัญชี, ชื่อจริง, รหัสผ่าน, ผูก Google
│   │       │       └── verify/          ฟอร์มกรอกรหัส + [code] หน้าตรวจสอบสาธารณะ
│   │       ├── components/
│   │       │   ├── ui/            design system VEC UI (vendored จาก vec-day01, MIT) — ดูหมายเหตุด้านล่าง
│   │       │   ├── shell/         LmsShell: เมนูตาม role, ค้นหา, ธีม, เมนูผู้ใช้
│   │       │   └── …              course/, learning/, instructor/, admin/, auth/, account/
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

## UI design system (`apps/web/src/components/ui`)

คัดลอกมาจาก theme **vec-day01** (MIT) ทุกไฟล์มี `"use client"` และ import ผ่าน `@/components/ui`
- **ไม่ได้นำมา:** `map-explorer` (maplibre), `rich-text` (tiptap), `chat`, `id-card` เพราะ LMS ยังไม่ได้ใช้และต้องเพิ่ม dependency ขนาดใหญ่
- **สิ่งที่แก้จากต้นฉบับ** (ถ้าดึงเวอร์ชันใหม่จาก theme ต้องแก้ซ้ำ):
  - `theme.tsx` อ่านค่าธีมด้วย `useSyncExternalStore` (SSR-safe) และใช้ script ใน `<head>` (`theme-script.ts`, มี CSP nonce) เพื่อไม่ให้จอกระพริบตอนโหลด
  - `toast.tsx` สร้าง portal หลัง mount เท่านั้น
  - `app-shell.tsx` เมนูรองรับ `href` (เป็น `next/link`) และอ่านสถานะยุบ sidebar หลัง hydrate
  - `button.tsx` ใช้ `type="button"` เป็นค่าเริ่มต้น และแยก class ไปไว้ใน `button-styles.ts` เพื่อให้ server component ใช้ `buttonClass()` กับ `<Link>` ได้
  - เพิ่ม `!` ตรงจุดที่ `noUncheckedIndexedAccess` ฟ้อง
- `apps/web` ปิด `exactOptionalPropertyTypes` (โค้ดต้นฉบับเขียนโดยไม่ได้เปิด flag นี้) ส่วน `packages/*` ยังเปิดอยู่
- ESLint ปิดเฉพาะกฎ react-hooks เชิง performance/สไตล์ในโฟลเดอร์นี้ กฎด้านความปลอดภัยยังเปิดอยู่ทุกไฟล์
- ฟอนต์ Inter + Noto Sans Thai มาจาก `next/font` ซึ่งดาวน์โหลดตอน build แล้ว serve จาก origin เราเอง: ตอนใช้งานจริงไม่มี request ไป Google และ `font-src 'self'` ยังเหมือนเดิม
- ภาพปกหลักสูตรคือ thumbnail ของ YouTube ผ่าน `/_next/image` (server ไปดึงจาก `i.ytimg.com`) ทำให้ browser ไม่ต้องติดต่อ Google เอง

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

## Flow: หลักสูตรอบรมและรอบอบรม

1. admin สร้างรายวิชา (กำหนดผู้สอนได้) แล้วรวมเป็น `programs` ผ่าน `program_courses` (เรียงลำดับ, วิชาบังคับ/เลือก)
2. เผยแพร่หลักสูตรได้เมื่อผ่าน `programPublishProblems` (packages/core) แนะนำให้ตั้งรายวิชาเป็น `unlisted`
   รายวิชา `unlisted` ที่อยู่ในหลักสูตรที่เผยแพร่ ลงทะเบียนตรงไม่ได้ (`PROGRAM_REGISTRATION_REQUIRED`)
3. `program_cohorts` เก็บเฉพาะสถานะที่ admin กำหนด (draft/published/cancelled) ส่วน phase ที่ผู้ใช้เห็น
   (scheduled/open/closed/in_progress/completed) คำนวณจากวันที่และเวลาปัจจุบันด้วย `deriveCohortPhase` ทุกครั้ง
4. สมัคร: ล็อกแถว cohort (`FOR UPDATE`) → ตรวจ phase, กฎผู้สอน, `evaluateEligibility`, คำตอบใบสมัคร → `decideSeat`
   ไม่ต้องอนุมัติ = approved + ลงทะเบียนทุกรายวิชา (`enrollments.cohort_id`) · ต้องอนุมัติ = pending · ที่นั่งเต็ม = waitlisted
5. เข้าเรียนได้ตั้งแต่ `starts_at` ของรอบ (`COHORT_NOT_STARTED`) · ไม่อนุมัติ/ยกเลิก จะเลื่อนรายชื่อสำรองอัตโนมัติ
6. ยกเลิกรอบ = ยกเลิกใบสมัครที่ค้าง เพิกถอน enrollment ที่ได้จากรอบนั้น และส่งอีเมลแจ้ง
7. worker `cohort-notifications` (ทุก 15 นาที) ส่งอีเมลแจ้งผู้ได้รับอนุมัติเมื่อรอบเริ่ม

