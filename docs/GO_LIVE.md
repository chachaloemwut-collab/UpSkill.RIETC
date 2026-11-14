# Go-Live Runbook — UpskillReskill.RIETC

ขั้นตอนเปิดระบบจริงแบบเรียงลำดับ ใช้คู่กับ [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) (checklist) และ [DEPLOY.md](./DEPLOY.md) (Hosting Jasmine)

**สถานะ:** โค้ดทั้งหมดพร้อมแล้ว (feature + monitoring/alerting + object storage + CI) เหลือเฉพาะรายการที่ต้องใช้ **credentials / สิทธิ์ภายนอก** ด้านล่าง

## 0. รวบรวมของที่ต้องใช้ก่อนเริ่ม

| สิ่งที่ต้องมี | เอามาจาก | ใช้ในข้อ |
|---|---|---|
| บัญชี Google Cloud (เปิด billing ได้) | Google Cloud Console | 1 |
| บัญชี SMTP (เช่น Google Workspace, Brevo, AWS SES) | ผู้ให้บริการอีเมล | 2 |
| บัญชี Object storage (AWS S3 / MinIO / Cloudflare R2 / Spaces) | ผู้ให้บริการ storage | 3 |
| โดเมน + สิทธิ์ reverse proxy (ผู้ดูแล Jasmine) | Hosting | 4 |
| สิทธิ์ผู้ดูแลฐานข้อมูล Jasmine | Hosting | 5 |
| ชื่อหน่วยงาน + ช่องทางติดต่อ + ฝ่ายกฎหมาย | องค์กร | 6 |

## 1. YouTube API key (บังคับสำหรับ `APP_ENV=production`)

1. [console.cloud.google.com](https://console.cloud.google.com) → สร้าง/เลือก project → **APIs & Services → Library** → เปิด **YouTube Data API v3**
2. **Credentials → Create credentials → API key**
3. จำกัด key: **Application restrictions → IP addresses** (ใส่ IP ของเซิร์ฟเวอร์ Jasmine ที่ออก request) + **API restrictions → YouTube Data API v3** เท่านั้น
4. นำ key ใส่ `YOUTUBE_API_KEY` ใน `.env` (หรือ Secret Manager)

## 2. SMTP จริง

1. สร้าง SMTP credential จากผู้ให้บริการ (host, port, username, password, security `none|starttls|tls`)
2. หลัง deploy เข้า admin → **ตั้งค่าอีเมล** กรอกค่า (รหัสผ่านถูกเข้ารหัสก่อนเก็บด้วย `SETTINGS_ENCRYPTION_KEY`)
3. ตั้ง `EMAIL_WEBHOOK_SECRET` (≥16 ตัวอักษร) แล้วผูก webhook ของผู้ให้บริการไปที่ `/api/webhooks/email` เพื่อ track สถานะส่ง

## 3. Object storage สำหรับใบรับรอง PDF

1. สร้าง **private bucket** (S3/MinIO/R2/Spaces) + credentials (access key / secret key)
2. ตั้ง env:
   ```env
   CERT_STORAGE_DRIVER=s3
   CERT_S3_BUCKET=<bucket>
   CERT_S3_REGION=<region>            # เช่น ap-southeast-1 / auto (R2)
   CERT_S3_ENDPOINT=<url>             # เฉพาะ non-AWS (MinIO/R2/Spaces)
   AWS_ACCESS_KEY_ID=<key>
   AWS_SECRET_ACCESS_KEY=<secret>
   ```
3. Web stream PDF ผ่าน server หลังตรวจ auth → bucket ต้อง **private** (ไม่เปิด public read)

## 4. โดเมน + HTTPS + reverse proxy

1. ผูกโดเมนกับ Hosting Jasmine (ตาม DEPLOY.md: proxy ไป `http://127.0.0.1:54744`)
2. reverse proxy ต้อง:
   - ส่ง `Host` เดิม + `X-Forwarded-Proto: https`
   - ส่ง `X-Real-IP` / `X-Forwarded-For` ของ client จริง และ**ลบ header นี้ถ้า client ส่งมาเอง** (ระบบกัน rate limit ปลอม)
3. แจ้งโดเมนจริง → ตั้ง `APP_ORIGIN=https://<domain>` ใน `.env` แล้ว redeploy

## 5. DB least-privilege (สำคัญด้านความปลอดภัย)

1. ขอผู้ดูแล Jasmine สร้าง role ในฐาน `lpe1831zma9pmg`:
   ```sql
   CREATE ROLE upskill_app LOGIN PASSWORD '<รหัส>';
   CREATE ROLE upskill_readonly LOGIN PASSWORD '<รหัส>';
   ```
2. ตั้ง `DATABASE_URL` เป็น `upskill_app`, `DATABASE_MIGRATION_URL` เป็น owner เดิม แล้ว**ลบ `MIGRATION_SKIP_ROLE_GRANTS=1`**
3. รัน `docker compose up -d` ใหม่ → migration จะ GRANT/REVOKE ตาม role ให้เอง
   (ตอนนี้ถ้ายังไม่มี role แยก แอปเชื่อมด้วยบัญชี owner = ถ้า SQL injection หลุดจะ DROP ตารางได้)

## 6. PDPA / ข้อมูลส่วนบุคคล

1. กรอกชื่อผู้ควบคุมข้อมูล + ช่องทางติดต่อจริงใน `apps/web/src/lib/privacy.ts` (ตอนนี้เป็น placeholder)
2. ให้ฝ่ายกฎหมายตรวจประกาศความเป็นส่วนตัว (`/privacy`) ก่อนเปิดจริง
3. กำหนด retention ของ `audit_logs` (มี IP) — ตารางนี้ **append-only** (ลบไม่ได้แม้แต่ owner) ต้องให้ DBA ใช้ `ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_append_only; DELETE …; ENABLE TRIGGER;` ตามรอบ (เช่น 1 ปี)

## 7. Backup + restore drill

1. **DB**: ให้ผู้ดูแลส่วนกลาง `pg_dump` ฐาน `lpe1831zma9pmg` ทุกวัน (DEPLOY.md)
2. **ใบรับรอง PDF**: สำรอง Docker volume `jasmine_certificates`
3. **`.env`**: สำรองนอกเครื่อง (สำคัญสุด: `CERT_SIGNING_PRIVATE_KEY`, `CERT_PUBLIC_KEYS`, `SETTINGS_ENCRYPTION_KEY`)
4. **ทดสอบ restore อย่างน้อย 1 ครั้ง** ก่อนเปิดจริง

## 8. สลับเป็น production + เปิดจริง

1. ตั้ง `APP_ENV=production` (env validation จะบังคับ: `APP_ORIGIN` เป็น https + `YOUTUBE_API_KEY` มีค่า)
2. `scripts/deploy-jasmine.sh deploy` (หรือให้ deployer รันเอง)
3. ตรวจ `docker compose ps` (migrate exited 0, web/worker healthy) + `curl -I https://<domain>/login` → 200
4. เข้า system owner → เปลี่ยนรหัสผ่านทันที → สร้าง admin/ผู้สอนจริง
5. เปิด HSTS preload หลังยืนยันทุก subdomain เป็น HTTPS

## ✅ Verify ก่อนประกาศเปิด

- [ ] `GET /api/health` → 200
- [ ] สมัคร → ยืนยันอีเมล (Mailpit/SMTP จริง) → เรียน → สอบ → ใบรับรอง + ดาวน์โหลด PDF
- [ ] ทดสอบบน iOS Safari, Android Chrome, LINE in-app browser
- [ ] ทดสอบ verify ใบรับรองสาธารณะ (valid / revoked / tampered)
- [ ] ส่ง test alert (tampered → admin ได้อีเมล)
