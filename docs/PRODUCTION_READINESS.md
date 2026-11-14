# Production Readiness — UpskillReskill.RIETC

ตรวจล่าสุด 14 พฤศจิกายน 2026 สรุปสิ่งที่**พร้อมแล้ว**และสิ่งที่**ยังต้องทำ**ก่อนเปิดให้ผู้เรียนจริง
ใช้เป็น checklist เปิดระบบคู่กับ [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md), [SECURITY.md](./SECURITY.md) และ [DEPLOY.md](./DEPLOY.md)

## สถานะโดยรวม

- Feature ครบ: เรียน/สอบ/ใบรับรอง, หลักสูตรอบรม + รอบอบรม + เงื่อนไขผู้สมัคร, ประกาศประชาสัมพันธ์ (เฟส 1–5 เสร็จแล้ว)
- CI/CD มีแล้ว: GitHub Actions `ci.yml` (typecheck + lint + unit + E2E + gitleaks + CodeQL)
- Production image (`web.Dockerfile`, `worker.Dockerfile`) และ deploy ไป Jasmine ผ่าน SFTP (`deploy-jasmine.sh`) มีแล้ว
- Monitoring/alerting พื้นฐาน: ✅ เพิ่มแล้ว 14 พ.ย. (ดูหัวข้อ Monitoring)

## Monitoring / Alerting (เพิ่มแล้ว)

| สัญญาณ | กลไก | สถานะ |
|---|---|---|
| ใบรับรองถูกแก้ไข (tampered) | `verify.service.ts` ส่ง `system-alert` ให้ admin ทันที (dedup ต่อรหัส) | ✅ ทำแล้ว |
| BullMQ job ล้มเหลวครั้งสุดท้าย | `index.ts` failed handler ส่ง alert admin (ข้าม `certificate-pdf` ที่แจ้งเองแล้ว) | ✅ ทำแล้ว |
| อัตรา anticheat ผิดปกติ | worker job `ops-health` ทุก 15 นาที นับ flag ใน 60 นาที เกิน `ANTICHEAT_ALERT_THRESHOLD` (default 100) → alert (dedup ต่อชั่วโมง) | ✅ ทำแล้ว |
| Uptime / liveness | `GET /api/health` → `{ ok: true }` (ไม่แตะ DB/Redis) | ✅ ทำแล้ว |

สิ่งที่ยังควรเพิ่ม (เฟสถัดไป): dashboard รวม metrics, alert ช่องทางอื่น (LINE/webhook) แทนอีเมลล้วน, log aggregation (Sentry/Prometheus) — ตอนนี้ log ยังเป็น stdout pino เท่านั้น

## 🔴 P0 — ต้องมีก่อนเปิดจริง (รอ credentials / บุคคลภายนอก)

- [ ] `YOUTUBE_API_KEY` (จำกัด IP + เฉพาะ YouTube Data API v3) แล้วเปลี่ยน `APP_ENV=production`
- [ ] โดเมนจริง + HTTPS: ตั้ง `APP_ORIGIN=https://<domain>`; reverse proxy ส่ง `X-Forwarded-Proto: https`, `X-Real-IP`/`X-Forwarded-For` และ**ลบ header ที่ client ส่งมา**
- [ ] SMTP จริง (แทน fallback) + `EMAIL_WEBHOOK_SECRET` เพื่อ track สถานะส่ง
- [ ] DB least-privilege: ขอผู้ดูแล Hosting สร้าง role `upskill_app`/`upskill_readonly` แล้วปิด `MIGRATION_SKIP_ROLE_GRANTS=1` (ตอนนี้แอปเชื่อมด้วยบัญชี owner = เสี่ยง SQL injection → DROP ตารางได้)
- [ ] PDPA: กรอกผู้ควบคุมข้อมูลจริงใน `apps/web/src/lib/privacy.ts` + ฝ่ายกฎหมายตรวจประกาศ + กำหนด retention ของ audit log (มี IP)
- [ ] Backup + restore drill: `pg_dump` ทุกวัน, volume `jasmine_certificates`, สำรอง `.env` (signing key / encryption key) + ทดสอบ restore 1 ครั้ง

## 🟠 P1 — ควรมีทันทีหลังเปิด

- [ ] Object storage (S3-compatible private bucket + signed URL) แทน disk สำหรับ PDF — interface อยู่ที่ `packages/infra/src/storage.ts`
- [ ] เปิด GitHub Code Security → CodeQL upload SARIF (ตอนนี้ `upload: never`)
- [ ] Pin GitHub Actions เป็น commit SHA (มี TODO ใน `ci.yml`)

## 🟡 P2 — คุณภาพ / scale

- [ ] ทดสอบอุปกรณ์จริง: iOS Safari, Android Chrome, iPad Split View, LINE/Facebook in-app browser
- [ ] HSTS preload (หลังยืนยันทุก subdomain เป็น HTTPS)
- [ ] Runbook หมุน key: cert signing key (เก็บ public key เก่าตลอด) และ `SETTINGS_ENCRYPTION_KEY` (ต้อง re-encrypt เลขบัตรทั้งหมด)
- [ ] ใบรับรองระดับหลักสูตร (program-level cert) — ถูกเลื่อนไว้ตามแผน ไม่ใช่ blocker
- [ ] หน้าสำหรับสิทธิของเจ้าของข้อมูล (ลบ/โอนย้าย) ตาม PDPA

## ข้อจำกัดที่ต้องรู้ (Residual Risk — จาก SECURITY.md)

- ระบบพิสูจน์ได้ว่า "วิดีโอถูกเล่นตามเวลาจริง" ไม่ใช่ "คนนั่งดูจริง" → ถ้าต้องการเข้มขึ้น เพิ่ม in-video checkpoint question
- หน้า verify เปิดเผยชื่อจริงต่อสาธารณะ → ต้องแจ้งในนโยบายความเป็นส่วนตัว
- Redis หาย = learning session หลุด (client กด play ใหม่) แต่ไม่กระทบเวลาที่บันทึกแล้ว
