# การนำขึ้น Hosting "มะลิ (Jasmine)"

ไฟล์นี้ถูกอัปโหลดไปพร้อมโค้ด (`/files/DEPLOY.md`) เพื่อให้ผู้ดูแล Hosting ใช้เป็นขั้นตอนเปิดระบบ

| รายการ | ค่า |
|---|---|
| Root Path | `/var/www/hosting/jasmine/` (SFTP: `/files`) |
| Docker Network (ฐานข้อมูล) | `uldkkd9ywqslup` (external) |
| พอร์ต | host `127.0.0.1:54744` → container `34050` · Proxy Target `http://127.0.0.1:54744` |
| PostgreSQL | 18.x ฐาน `lpe1831zma9pmg` ผู้ใช้ `jasmine_db` (ค่าจริงอยู่ใน `.env` บนเซิร์ฟเวอร์เท่านั้น) |

## สิ่งที่อยู่ในโฟลเดอร์หลัก

```
/var/www/hosting/jasmine/
├── compose.yml        บริการ: migrate (ครั้งเดียวแล้วจบ), web, worker, redis
├── .env               ค่าลับของระบบ (อัปโหลดแยก, mode 600) — ห้ามเปิดให้เว็บเซิร์ฟเวอร์อ่านเป็นไฟล์ static
├── RELEASE            เวลา build + commit ของชุดที่อัปโหลด
├── DEPLOY.md          ไฟล์นี้
├── apps/ packages/ infra/ package.json pnpm-lock.yaml ...   ซอร์สสำหรับ build image
```

ไม่มีไฟล์ข้อมูลอยู่ในโฟลเดอร์นี้: ใบรับรอง PDF อยู่ใน Docker volume `jasmine_certificates` และคิวอยู่ใน `jasmine_redis-data`

## สำหรับผู้ดูแล Hosting: เปิดระบบครั้งแรก

1. ตรวจว่าพอร์ต `54744` บนเครื่องยังว่าง: `ss -ltn | grep 54744` (ต้องไม่มีผลลัพธ์)
2. Build และเปิดระบบ (ต้องต่ออินเทอร์เน็ตตอน build: npm registry, Playwright Chromium, Google Fonts)
   ```bash
   cd /var/www/hosting/jasmine
   docker compose up -d --build
   docker compose ps                    # migrate = exited (0), web/worker/redis = running/healthy
   docker compose logs migrate          # ต้องเห็น "applied 000N_..." หรือไม่มี error
   curl -I http://127.0.0.1:54744/login # 200
   ```
3. ผูกโดเมน และทำ HTTPS ที่ reverse proxy ไปยัง `http://127.0.0.1:54744`
   - proxy ต้องส่ง header `Host` เดิม และ `X-Forwarded-Proto: https`, `X-Real-IP`/`X-Forwarded-For` (ใช้สำหรับ rate limit)
   - แจ้งโดเมนจริงกลับมา: นักพัฒนาจะตั้ง `APP_ORIGIN=https://<โดเมน>` ใน `.env` แล้วอัปโหลดใหม่ จากนั้นสั่ง `docker compose up -d` อีกครั้ง
4. ถ้า migration ล้มเหลวด้วย `permission denied to create extension "citext"` ให้ผู้ดูแลรัน `CREATE EXTENSION IF NOT EXISTS citext;` ในฐาน `lpe1831zma9pmg` แล้วสั่ง `docker compose up -d` ใหม่

## อัปเดตเวอร์ชัน: นักพัฒนาทำเองผ่าน deployer (ผู้ดูแลไม่ต้องสั่งทุกครั้ง)

เมื่อสั่ง `docker compose up -d --build` ครั้งแรก จะมีบริการ `deployer` เปิดขึ้นด้วย บริการนี้เฝ้าไฟล์ `deploy-request`
ที่นักพัฒนาอัปโหลดผ่าน SFTP แล้วรันคำสั่งตายตัวต่อไปนี้ให้เอง (ไม่รันสิ่งที่อยู่ในไฟล์คำขอ เพียงเทียบค่ากับ `RELEASE`):

```bash
docker compose -p jasmine build migrate web worker
docker compose -p jasmine up -d migrate web worker redis
docker image prune -f --filter label=com.docker.compose.project=jasmine
```

หลัง `up` แล้ว deployer จะตรวจ `/api/health` ของ web ซ้ำจนกว่าจะตอบ (สูงสุด 2 นาที) แล้วจึงเขียนผลลัพธ์
ลง `deploy-status` และ `deploy-log.txt` ในโฟลเดอร์เดียวกัน นักพัฒนาอ่านได้ผ่าน SFTP — ผล `ok` หมายถึงเว็บตอบจริงแล้ว

การแก้ค่าใน `.env` (ผ่าน `upload-env`) ก็จะถูกส่งเป็นคำขอให้ deployer รัน `up -d` เพื่อ recreate services ให้ใหม่เอง
(Compose สร้าง container ใหม่เมื่อ env_file เปลี่ยน) — ผู้ดูแลจึงไม่ต้องสั่งอะไรอีกทั้งสำหรับโค้ดและ configuration

**ข้อควรรู้ด้านความปลอดภัย:** `deployer` ต่อกับ `/var/run/docker.sock` ซึ่งมีสิทธิ์เทียบเท่า root ของเครื่อง จึงจำกัดไว้ดังนี้
ไม่มีเครือข่าย (`network_mode: none`), ไม่เปิดพอร์ต, ระบบไฟล์อ่านอย่างเดียว และรันเฉพาะคำสั่ง compose ของโปรเจกต์ `jasmine`
ผู้ที่อัปโหลดโค้ดผ่าน SFTP ได้ก็กำหนดสิ่งที่ถูก build ได้อยู่แล้ว deployer จึงไม่เพิ่มช่องทางใหม่ให้คนนอก
หากนโยบายของ Hosting ไม่อนุญาตให้ container ใช้ Docker socket ให้ปิดด้วย `docker compose stop deployer`
แล้วกลับไปใช้วิธีด้านล่าง

ปิด deployer ถาวร: `docker compose rm -sf deployer` · ดูการทำงาน: `docker compose logs -f deployer`

### อัปเดตด้วยมือ (กรณีไม่ใช้ deployer)

```bash
cd /var/www/hosting/jasmine
cat RELEASE                      # ตรวจว่าเป็นชุดที่ตั้งใจ
docker compose up -d --build     # migrate รันก่อน web/worker อัตโนมัติ (migration เป็นแบบเดินหน้าอย่างเดียว)
docker image prune -f --filter label=com.docker.compose.project=jasmine   # ลบเฉพาะ image เก่าของ jasmine
```

## สำรองข้อมูล (ยังไม่มีตารางสำรองของ Hosting — ควรตั้ง)

- ฐานข้อมูล: `pg_dump` ฐาน `lpe1831zma9pmg` ทุกวัน (ประสานผู้ดูแลส่วนกลาง)
- ใบรับรอง PDF: volume `jasmine_certificates` (สร้างใหม่ได้จากฐานข้อมูล แต่สำรองไว้จะเร็วกว่า)
- `.env` เก็บสำเนาไว้นอกเครื่องในที่ปลอดภัย โดยเฉพาะ:
  - `CERT_SIGNING_PRIVATE_KEY` และ `CERT_PUBLIC_KEYS`: ถ้าหาย ใบรับรองเดิมยังตรวจได้ถ้ายังมี public key แต่จะออกใบใหม่ด้วย key เดิมไม่ได้
  - `SETTINGS_ENCRYPTION_KEY`: ถ้าหาย ต้องกรอกรหัสผ่าน SMTP ในหน้าผู้ดูแลระบบใหม่

## สำหรับนักพัฒนา: ช่องทางอัปโหลด

ใช้ `scripts/deploy-jasmine.sh` (ต้องมี `lftp`: `brew install lftp`)

| คำสั่ง | ทำอะไร |
|---|---|
| `scripts/deploy-jasmine.sh init` | สร้าง `deploy/jasmine/secrets/.env` (สร้าง signing key และรหัส Redis ให้) และ `sftp.env` — โฟลเดอร์ `secrets/` ถูก gitignore |
| `scripts/deploy-jasmine.sh check` | typecheck + lint + tests ก่อนส่ง |
| `scripts/deploy-jasmine.sh stage` | สร้างชุดอัปโหลดที่ `dist/deploy/jasmine` (เฉพาะโค้ด และตรวจว่าไม่มีค่าลับหลุดเข้าไป) |
| `scripts/deploy-jasmine.sh ls` | ทดสอบเข้า SFTP และแสดงไฟล์ใน `/files` |
| `scripts/deploy-jasmine.sh upload` | stage แล้วอัปโหลดไป `/files` (ไม่ลบไฟล์บนเซิร์ฟเวอร์ และไม่แตะ `.env`) |
| `scripts/deploy-jasmine.sh upload-env` | อัปโหลด `.env` (เฉพาะเมื่อแก้ค่า และต้องไม่มี `CHANGE_ME` เหลือ) |
| `scripts/deploy-jasmine.sh deploy` | อัปโหลด แล้วส่งคำขอให้ `deployer` build และเปิดเวอร์ชันใหม่ จากนั้นรอผล (สูงสุด 30 นาที) |
| `scripts/deploy-jasmine.sh logs` | แสดงผล deploy ล่าสุด (`deploy-status`) และท้าย `deploy-log.txt` |
| `scripts/deploy-jasmine.sh status` | แสดง commit ที่อยู่บนเซิร์ฟเวอร์ และตรวจว่าโดเมนจริงตอบหรือยัง |

หลังเปิดระบบครั้งแรก:
- เข้าสู่ระบบด้วยบัญชีเจ้าของระบบ: ชื่อผู้ใช้ `SYSTEM_OWNER_USERNAME` และรหัสผ่าน `SYSTEM_OWNER_PASSWORD` ใน `.env` แล้วเปลี่ยนรหัสผ่านทันที
- ตั้งค่า SMTP ในหน้าผู้ดูแลระบบ ระบบเก็บรหัสผ่านแบบเข้ารหัส ส่วน `SMTP_URL` ใน `.env` เป็นค่าสำรองที่ยังไม่ส่งอีเมลจริง

ค่าที่ยังต้องมีก่อนเปิดให้ผู้เรียนใช้จริง: YouTube API key (จำเป็นเมื่อเปลี่ยนเป็น `APP_ENV=production`) และ Google OAuth (ไม่บังคับ)

### ข้อจำกัดของ Hosting นี้เทียบกับการออกแบบ

- **บัญชีฐานข้อมูลบัญชีเดียว:** สร้าง role `upskill_app`/`upskill_readonly` ไม่ได้ จึงตั้ง `MIGRATION_SKIP_ROLE_GRANTS=1` ให้ migration ข้ามเฉพาะคำสั่ง GRANT/REVOKE ของสอง role นี้ แอปจึงเชื่อมต่อด้วยบัญชีเจ้าของ schema
  - trigger ที่ห้ามแก้ `audit_logs` และห้ามแก้ใบรับรองที่ออกแล้วยังทำงานเหมือนเดิม
  - สิ่งที่หายไปคือชั้นป้องกันระดับสิทธิ์ (ถ้าแอปถูกเจาะด้วย SQL injection จะ DROP ตารางได้)
  - ถ้าผู้ดูแลส่วนกลางสร้าง role แยกให้ได้ในอนาคต ควรกลับไปใช้แบบเดิม
- **`APP_ENV=staging` ระหว่างยังไม่มี YouTube API key:** ผู้สอนกรอกความยาววิดีโอเองได้ ซึ่งเชื่อถือได้น้อยกว่าการดึงจาก YouTube ควรเปลี่ยนเป็น `production` ก่อนเปิดให้ผู้เรียนจริง
