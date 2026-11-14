# UpskillReskill.RIETC

LMS แบบเปิดที่ใช้วิดีโอ YouTube เป็นสื่อการสอน — **Minimalist Features, Maximum Integrity**
ระบบกันโกงเวลาเรียนฝั่ง server + ใบรับรองดิจิทัล (Ed25519) ที่ตรวจสอบได้ผ่าน QR Code

- สถาปัตยกรรม: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- ความปลอดภัย และจุดที่ต่างจาก SRS: [docs/SECURITY.md](docs/SECURITY.md)
- นำขึ้น Hosting มะลิ (Jasmine) ผ่าน SFTP: [docs/DEPLOY.md](docs/DEPLOY.md)
- สถานะฟังก์ชันและงานที่ยังไม่พร้อม production: [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)
- Checklist ความพร้อม production: [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md)
- ขั้นตอนเปิดระบบจริง (go-live): [docs/GO_LIVE.md](docs/GO_LIVE.md)

## เริ่มต้นพัฒนา

ต้องมี: **Node.js 24 LTS** (`nvm use` หรือ `brew install node@24`), **Docker**

```bash
corepack enable                 # ใช้ pnpm ตามเวอร์ชันใน package.json
pnpm install
pnpm setup:env                  # สร้าง .env.local + คีย์ลงนามใบรับรอง + ลิงก์ไปที่ apps/web
pnpm infra:up                   # postgres :55432, redis :6379, mailpit :8025
pnpm db:migrate
pnpm db:seed                    # ผู้ใช้ตัวอย่าง 3 คน + หลักสูตรตัวอย่าง
cd apps/worker && ./node_modules/.bin/playwright install chromium && cd ../..   # สำหรับสร้าง PDF
pnpm dev                        # web http://localhost:3000 + worker
```

บัญชีตัวอย่าง (รหัสผ่าน `upskill-dev-password`): `admin@upskill.test`, `instructor@upskill.test`, `learner@upskill.test`
อีเมลทุกฉบับ (ยืนยันอีเมล, รีเซ็ตรหัสผ่าน) ดูได้ที่ Mailpit http://localhost:8025

**ตัวเลือก:** ใส่ `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` เพื่อเปิดปุ่ม Google, ใส่ `YOUTUBE_API_KEY` เพื่อให้ระบบดึงความยาววิดีโอเอง (ถ้าไม่ใส่ ในโหมด local ผู้สอนกรอกความยาวเองได้)

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm test` | unit tests ของกฎธุรกิจ (กันโกง, ใบรับรอง, quiz, OAuth linking, UA) |
| `pnpm test:e2e` | end-to-end ทั้ง flow กับ stack จริง (ต้องรัน web + worker ก่อน) |
| `pnpm typecheck` / `pnpm lint` | ตรวจ type ทุก package / ESLint |
| `pnpm db:migrate` | รัน migration ที่ยังไม่ได้รัน (forward-only, มี checksum) |
| `pnpm db:codegen` | สร้าง type จาก schema จริง → commit `packages/db/src/generated.ts` ด้วย |
| `pnpm run audit` | ตรวจช่องโหว่ dependencies ที่ใช้ใน production |
| `docker build -f infra/docker/web.Dockerfile .` | image production ของ web (worker: `worker.Dockerfile`) |

## เพิ่ม migration

สร้างไฟล์ `packages/db/migrations/000N_name.sql` (ห้ามแก้ไฟล์ที่ apply แล้ว — runner ตรวจ checksum) → `pnpm db:migrate` → `pnpm db:codegen` → commit ทั้งคู่
ตารางใหม่ต้อง `GRANT` ให้ `upskill_app` ใน migration เดียวกัน
