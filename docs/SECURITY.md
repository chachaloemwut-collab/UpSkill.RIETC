# UpskillReskill.RIETC — Security Design & Spec Deviations

เอกสารนี้อธิบาย **จุดที่ scaffold นี้เปลี่ยนไปจาก SRS v1.0.0** และเหตุผลด้านความปลอดภัย
ทีมควรรีวิวและอัปเดต SRS ให้ตรงกัน

## หลักการ

1. **Client = UX, Server = Security** — ทุกอย่างในเบราว์เซอร์ (ซ่อน controls, บล็อกกรอ, บังคับ speed 1x) ถูก bypass ได้ด้วย DevTools ภายใน 10 วินาที ความถูกต้องของเวลาเรียนต้องพิสูจน์ได้จาก **wall-clock ของ server** เท่านั้น
2. **Defense in depth** — กฎสำคัญบังคับทั้งที่ app และ DB (trigger/grant) เช่น ชื่อที่ล็อกแล้ว, ใบรับรอง immutable, audit log append-only
3. **Least privilege** — app ใช้ DB role ที่ไม่มีสิทธิ์ DDL และลบ audit log ไม่ได้
4. **Fail closed** — env ไม่ครบ = ไม่ start, verify ไม่ผ่าน = แสดง "ไม่สามารถยืนยันได้"

---

## Spec Deviations

| # | หัวข้อ SRS | ของเดิม | ที่เปลี่ยน | เหตุผล |
|---|---|---|---|---|
| D1 | 5.2 Heartbeat | ให้เครดิต 1 chunk ต่อ ping, `accumulated += min(elapsed, 12)` | ให้เครดิตเป็น **ช่วง** `[last_position, current]` จำกัดด้วย `min(delta, elapsed)` | ไม่ต้องมี retry queue ฝั่ง client — เน็ตหลุด ≤35 วิ ping ถัดไปครอบคลุมได้เอง |
| D2 | 5.2 ข้อ 3 | ping ห่าง <8 วิ → 429 + `cheat_flag_count+1` | ห่าง <2 วิ → ignore (ไม่ flag) | กฎเดิม **flag ผู้ใช้สุจริต**: ตอน pause/ended client ต้อง flush ทันที และ retry หลังเน็ตกลับก็ยิงถี่ เครดิตถูกจำกัดด้วย wall-clock อยู่แล้ว การยิงถี่จึงไม่ได้ประโยชน์ |
| D3 | 5.2 | ไม่ตรวจความเร็ว (เชื่อ `onPlaybackRateChange` ฝั่ง client) | ตรวจ **cumulative speed** ตลอด segment: `content_advanced ≤ wall_clock + 4s` | 1.25x–1.5x ตรวจไม่เจอต่อ ping เดียว แต่สะสมแล้วเกินภายใน 2–3 ping |
| D4 | 5.2 | `max_watched_sec = max(..., current_second)` ทุก ping | ขยับ frontier เฉพาะ segment ที่ **เริ่มต่อจาก frontier** | ของเดิม: `player.seekTo(600)` ผ่าน console แล้วรอ 10 วิ → frontier กระโดดไป 600 ทันที |
| D5 | 5.2 | `client_timestamp` ใน payload | ตัดออก, เพิ่ม `seq` (strictly increasing) | ไม่ใช้นาฬิกา client เลย; `seq` กัน replay/duplicate |
| D6 | 4 / 5.2 | `users.active_stream_token` | Redis `learn:active:{userId}` (atomic SET + TTL) + ตาราง `learning_sessions` | ไม่เขียน `users` ทุก 10 วิ, แท็บที่ปิดไปหมดอายุเอง, มี forensic trail |
| D7 | 5.2 | ไม่ระบุ concurrency | `SELECT … FOR UPDATE` + ใช้ `now()` ของ DB | กัน race ส่ง 2 ping พร้อมกันได้เครดิตซ้ำ; หลาย instance ไม่ต้องพึ่ง clock sync |
| D8 | 5.4 | HMAC-SHA256, "ห้ามเปลี่ยนคีย์" | **Ed25519 + key id**, เก็บ `signed_payload` | HMAC: ใครถือคีย์ verify ก็ปลอมได้, rotate ไม่ได้, บุคคลที่สามตรวจเองไม่ได้ / Ed25519: rotate ได้, public key ที่ `/.well-known/certificate-keys.json` |
| D9 | 5.4 | ต่อ string ด้วย `\|` แล้ว HMAC ใหม่จาก DB | Canonical JSON + เก็บ string ที่ลงนามจริง | `\|` ในชื่อทำ field shifting ได้; `issued_at` ที่ Postgres สร้างเอง (µs) ≠ ค่าที่ JS ใช้ลงนาม (ms) → **เสี่ยงที่ใบจริงจะ verify ไม่ผ่าน** |
| D10 | 5.4 | `CERT-YYYY-{8 hex}` (32 bit) | `CERT-YYYY-XXXX-XXXX-XXXX` (60 bit Crockford) + rate limit | หน้า verify เป็น public และแสดงชื่อจริง — 32 bit ไล่เดาได้ = scrape ข้อมูลส่วนบุคคล |
| D11 | 5.1 | เจอบัญชี email ยังไม่ verify → "ให้ล็อกอินด้วยรหัสผ่านก่อน" | **Takeover**: ล้าง password, revoke sessions แล้วผูก Google | Pre-account hijacking: ผู้โจมตีสมัครด้วยอีเมลเหยื่อทิ้งไว้ เจ้าของจริงไม่รู้รหัส → เข้าไม่ได้ตลอดไป |
| D12 | 5.1 | เชื่อ `email_verified` ทุกโดเมน | auto-link เฉพาะ `@gmail.com` หรือมี claim `hd` | คำแนะนำของ Google: บัญชี Google ที่ใช้อีเมลภายนอก ความเป็นเจ้าของอีเมลอาจหมดไปแล้ว |
| D13 | 5.1 | Reset ผ่าน Google ด้วย `prompt=login` | `prompt=select_account` | Google **ไม่รองรับ** `prompt=login` (รองรับแค่ `none`, `consent`, `select_account`) |
| D14 | 8 | Cookie `SameSite=Strict` | `__Host-sid; HttpOnly; Secure; SameSite=Lax` + ตรวจ `Origin` | Strict: คลิกลิงก์จาก LINE/อีเมลจะดูเหมือน logout, OAuth callback พัง / `__Host-` กัน subdomain เขียนทับ cookie |
| D15 | 4 | access/refresh token | Opaque session token (เก็บ SHA-256) | revoke ทันทีได้ (spec ต้องการเตะทุกอุปกรณ์เมื่อเปลี่ยนรหัส) — JWT ทำแบบนี้ไม่ได้ |
| D16 | 3.2 | `onError` → ตั้ง `broken_video` ทันที | บันทึก report → worker ตรวจกับ YouTube API ก่อน + cron รายวัน | ไม่งั้นใครก็ยิง API ปลอมให้คอร์สคนอื่นขึ้นป้ายเสียได้ |
| D17 | 5.3 | สุ่มด้วย (ไม่ระบุ) | `crypto.randomInt` + **remap option id ต่อ attempt** + snapshot เก็บเฉลย + จำกัดครั้ง/วัน + time limit | กันแชร์ "ข้อ 1 ตอบ c" และกัน brute force คำตอบ |
| D18 | 4 | ไม่มี flow ยืนยันอีเมล | เพิ่ม `email_verification_tokens` | spec มี `email_verified_at` แต่ไม่มีวิธีตั้งค่า |
| D19 | 5.1 | (ไม่ระบุ) | ต้องยืนยันอีเมลก่อนล็อกอินด้วยรหัสผ่าน | บัญชีที่ใครก็สมัครทิ้งไว้ด้วยอีเมลคนอื่นใช้งานไม่ได้ และเจ้าของจริงยึดคืนได้ผ่าน Google (D11) |
| D20 | 6 | `GET /quiz/start` | `POST` | การเริ่มสอบสร้าง state และนับโควตาต่อวัน — GET ถูกยิงข้ามเว็บได้ด้วย `<img>` หรือ link prefetch |
| D21 | 5.3 | (ไม่ระบุ) | ผู้สอนลงทะเบียนหลักสูตรตัวเองไม่ได้; ลบบทเรียนไม่ได้เมื่อมีผู้เรียนแล้ว (เปลี่ยนวิดีโอแทน) | กันปั๊มใบรับรองให้ตัวเอง และกันความคืบหน้าของผู้เรียนหายเงียบ ๆ |
| D22 | 3.1 | แบนเนอร์เปิดเบราว์เซอร์ | LINE ใช้ `?openExternalBrowser=1` (รองรับโดย LINE), Android ใช้ Chrome intent, iOS อื่น ๆ ใช้ปุ่มคัดลอกลิงก์ | iOS ไม่มีวิธีบังคับเปิด Safari จาก WebView ที่เชื่อถือได้ |
| D23 | — | ลิงก์ในอีเมลทำงานทันทีเมื่อเปิด (GET) | หน้าแสดงปุ่มให้กด (POST) | ระบบสแกนลิงก์ของอีเมล (Outlook Safe Links ฯลฯ) เปิดลิงก์ล่วงหน้าแล้วจะ "ใช้" token ไปก่อน |

---

## ข้อมูลสมาชิกและ PDPA

- สมัครสมาชิกต้องกรอก คำนำหน้า/ชื่อ/นามสกุล ไทยและอังกฤษ, เลขประจำตัวประชาชน, วันเกิด, เบอร์โทรศัพท์, ที่อยู่
  และกดยอมรับประกาศความเป็นส่วนตัว (`/privacy`) ระบบบันทึกเวอร์ชันประกาศ (`PDPA_NOTICE_VERSION`) และเวลาที่ยอมรับ
  ใน `user_profiles` พร้อม audit `user.pdpa_consent` · อายุต่ำกว่า 20 ปีต้องมีชื่อ เบอร์ และความยินยอมของผู้ปกครอง
- เลขประจำตัวประชาชนไม่ถูกเก็บแบบอ่านได้: `national_id_hmac` (HMAC-SHA256, key ได้จาก HKDF ของ
  `SETTINGS_ENCRYPTION_KEY`) บังคับหนึ่งคนหนึ่งบัญชีด้วย UNIQUE, `national_id_encrypted` (AES-256-GCM) และ `last4` สำหรับแสดงผล
  trigger ห้ามแก้เลขบัตรหลังบันทึก และห้ามแก้ชื่อหลังล็อกชื่อบนใบรับรอง · role read-only ไม่มีสิทธิ์อ่านตารางนี้
- **ถ้าเปลี่ยน `SETTINGS_ENCRYPTION_KEY`** ต้องคำนวณ hmac และเข้ารหัสเลขบัตรใหม่ทั้งหมด (ถอดด้วย key เดิมก่อน) มิฉะนั้นตรวจซ้ำไม่ได้
- สมัครด้วยอีเมลที่มีอยู่แล้ว ระบบตอบเหมือนเดิมและไม่ตรวจเลขบัตร (กัน enumeration ของอีเมล) ส่วนเลขบัตรที่ซ้ำ ระบบแจ้ง
  `NATIONAL_ID_IN_USE` เพราะต้องบอกผู้สมัครว่ามีบัญชีอยู่แล้ว ความเร็วในการลองเลขบัตรถูกจำกัดด้วย rate limit การสมัครต่อ IP
- ลงทะเบียนเรียนและสมัครรอบอบรมต้องมีข้อมูลสมาชิกครบ (`PROFILE_REQUIRED`) ผู้ใช้ที่สมัครด้วย Google หรือสมัครก่อนมีระบบนี้
  จะเห็นแถบให้กรอกที่ `/me/profile`
- ยังไม่มีหน้าสำหรับยื่นคำขอใช้สิทธิ (ลบ/โอนย้ายข้อมูล) ผู้ดูแลต้องดำเนินการด้วยมือ และต้องกรอกผู้ควบคุมข้อมูลและช่องทางติดต่อจริง
  ใน `apps/web/src/lib/privacy.ts` พร้อมให้ฝ่ายกฎหมายตรวจข้อความประกาศก่อนเปิดใช้จริง

## Threat Model (ย่อ)

| ภัย | การป้องกัน | ไฟล์ |
|---|---|---|
| ปั๊มเวลาเรียนด้วย script ยิง API | เครดิต ≤ wall-clock, rate limit 10/นาที, seq, session lock | `packages/core/src/heartbeat.ts` |
| เร่งความเร็ว / กรอข้าม | cumulative speed check, frontier anchoring | ↑ |
| เปิดหลายแท็บ/อุปกรณ์ | Redis active lock → 409 | `packages/infra/src/learning-lock.ts` |
| ปลอมใบรับรอง / แก้ DB | Ed25519 + cross-check fields + immutable trigger | `packages/core/src/certificate.ts`, migration 0001 |
| Account takeover | Argon2id, rate limit ต่อ IP+บัญชี, timing-safe, revoke sessions | `packages/infra/src/password.ts` |
| Login CSRF / OAuth code injection | state cookie + Redis GETDEL + PKCE + nonce | `apps/web/src/server/auth/google.ts` |
| CSRF | SameSite=Lax + Origin check | `apps/web/src/server/http.ts` |
| XSS | CSP nonce + strict-dynamic, React escaping | `apps/web/src/proxy.ts` |
| IDOR | ทุก query ผูก `user_id`/`instructor_id` ของ session; 404 แทน 403 | services ทั้งหมด |
| SSRF ผ่าน PDF renderer | Playwright: JS ปิด, network block ทั้งหมด | `apps/worker/src/jobs/render-certificate-pdf.ts` |
| SQL injection | Kysely (parameterized) + DB role ไม่มี DDL | `packages/db` |
| ข้อมูลลับรั่วใน log | pino redact, env error แสดงแค่ชื่อ field, job log ไม่มี payload | `packages/infra/src/logger.ts` |
| User enumeration | register/forgot/resend ตอบเหมือนกันทุกกรณี; login ตอบ `INVALID_CREDENTIALS` เดียว + dummy hash | `apps/web/src/server/auth/auth.service.ts` |
| Mail bombing | rate limit ต่ออีเมล (hash) สำหรับ forgot/resend | `apps/web/src/app/api/auth/*` |
| Path traversal (PDF) | ชื่อไฟล์ผ่าน allowlist regex ของรหัสใบรับรองเท่านั้น | `packages/infra/src/storage.ts` |
| Supply chain | lockfile, `minimumReleaseAge` 7 วัน, `onlyBuiltDependencies`, Dependabot, CodeQL, gitleaks | `pnpm-workspace.yaml`, `.github/` |

## ข้อจำกัดที่ต้องรู้ (Residual Risk)

- **ระบบนี้พิสูจน์ได้ว่า "วิดีโอถูกเล่นตามเวลาจริง" ไม่ใช่ "คนนั่งดูจริง"** — headless browser ที่เล่นวิดีโอ 1x ทั้งคลิปจะผ่านได้เสมอ ถ้าต้องการมากกว่านี้ให้เพิ่ม in-video checkpoint question (คำถามสุ่มกลางคลิป) ซึ่งมีผลมากกว่าการเพิ่ม client-side check
- **YouTube API Policy** — การวางเลเยอร์ทับ player เพื่อบล็อกการคลิก (spec 5.2 ข้อ 2) อาจขัดกับ YouTube API Services Developer Policies เรื่องห้ามบดบัง/ดัดแปลง player — ตรวจสอบนโยบายล่าสุดก่อนใช้ scaffold นี้ **ไม่ได้ใส่ overlay** เพราะความปลอดภัยไม่ได้พึ่งมัน
- **PDPA** — หน้า verify เปิดเผยชื่อจริงต่อสาธารณะ: ต้องแจ้งในนโยบายความเป็นส่วนตัว/ขอความยินยอมตอนล็อกชื่อ; audit log ที่มี IP ควรกำหนด retention (เช่น 1 ปี); การลบบัญชีให้ใช้ anonymize แทน hard delete (audit log append-only)
- **Redis หาย** = ทุก learning session ถูกตัด (client ต้องกด play ใหม่) — ยอมรับได้ ไม่กระทบเวลาที่บันทึกแล้ว

## สิ่งที่ทดสอบอัตโนมัติแล้ว (`pnpm test:e2e`)

CSP/headers, CSRF (Origin), field ที่ไม่รู้จัก/payload ใหญ่, enumeration, รหัสผ่านอ่อน, ต้องยืนยันอีเมล, token ใช้ครั้งเดียว,
cookie flags, brute force → 429, สิทธิ์ member/instructor/admin, IDOR, URL YouTube ปลอม, เกณฑ์เผยแพร่,
heartbeat: เครดิตปกติ / กรอข้าม frontier ถูก flag / replay seq / แท็บที่สองตัดแท็บแรก / token ปลอม,
quiz: ไม่ส่งเฉลย + remap id, ใบรับรอง: ล็อกชื่อ / ออกครั้งเดียว / verify สาธารณะไม่เผย id / **ตรวจจับการแก้ DB** / PDF เฉพาะเจ้าของ / เพิกถอน,
reset password: เตะทุก session + token ใช้ครั้งเดียว

## Production Checklist (เพิ่มจาก SRS §8)

- [ ] `YOUTUBE_API_KEY` จำกัด IP + จำกัดเฉพาะ YouTube Data API v3
- [ ] Secrets อยู่ใน Secret Manager, ไม่อยู่ในไฟล์/image
- [ ] Ed25519 private key ใน KMS/Secret Manager; public keys เก่าเก็บใน `CERT_PUBLIC_KEYS` ตลอดไป
- [ ] Reverse proxy ตั้ง `X-Real-IP` และลบ header นี้ที่ client ส่งมา
- [ ] DB: app ใช้ `upskill_app`, migration ใช้ `upskill_owner`, TLS (`sslmode=verify-full`)
- [ ] Redis: password + TLS, ไม่เปิด public
- [ ] Pin GitHub Actions ด้วย commit SHA
- [ ] `APP_ENV=production` และ `APP_ORIGIN=https://...` (env validation จะไม่ยอม start ถ้าไม่ครบ)
- [ ] เปิด HSTS preload หลังยืนยันว่า subdomain ทั้งหมดเป็น HTTPS
- [ ] Alert เมื่อ verify ได้ผล `tampered` (หมายถึงมีคนแก้ DB)
- [ ] Rate limit `/api/auth/*` ครบทุก endpoint (preset อยู่ใน `RATE_LIMITS`)
- [ ] Backup DB + ทดสอบ restore

## ด่านตรวจอัตโนมัติก่อน merge (`pnpm security:check` รันใน `pnpm lint` และ CI)

- **ห้ามเขียน credential ในโค้ด** ไม่ว่ารหัสผ่าน, secret, API key, private key หรือการเทียบรหัสผ่านกับข้อความตายตัว (เช่น `password === "…"`) ให้อ่านจาก environment (`packages/infra/src/env.ts`) หรือการตั้งค่าที่เข้ารหัสเท่านั้น ข้อยกเว้นมีเฉพาะรหัสของสคริปต์ seed ในเครื่องนักพัฒนาที่ปฏิเสธการรันบน production และต้องมีหมายเหตุ `secrets-check: allow (เหตุผล)` ในบรรทัดนั้น
- **ทุก API route ต้องมีการตรวจสิทธิ์**
  - `/api/admin/*` ต้องมี `roles: ["admin"]` ทุก handler
  - `/api/instructor/*` ต้องมี `roles: ["instructor", "admin"]`
  - `/api/partner/*` ต้องใช้ `partnerRoute()` (ใช้กุญแจ API ร่วมกับรายการ IP ที่อนุญาต)
  - route อื่นที่ใช้ `route()` ต้องระบุ `auth:` ชัดเจน
  - route ที่ตรวจสิทธิ์เองต้องอยู่ในรายการ `SELF_AUTHENTICATED` พร้อมเหตุผล
- **gitleaks** ใน CI ยังสแกนรูปแบบ token มาตรฐานควบคู่กัน
- repo นี้เป็น **public** ถ้าเคยมี credential หลุดเข้า git ให้ถือว่ารั่วแล้ว และต้องเปลี่ยนค่าทันที การลบออกจากโค้ดอย่างเดียวไม่พอ
