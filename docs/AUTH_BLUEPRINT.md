# Blueprint: ระบบสมาชิก + สิทธิ์ (Auth & RBAC) — นำไปใช้ซ้ำกับโครงการใหม่

โฟลเดอร์/ไฟล์อ้างอิงทั้งหมดอยู่ใน `apps/web/src` (Next.js App Router) + `packages/{core,db,infra}`

## 1. สรุปสถาปัตยกรรม (สร้างเสร็จแล้ว ใช้ซ้ำได้ทันที)

| ชั้น | อยู่ที่ไหน | ทำอะไร |
|---|---|---|
| ตัวห่อ route มาตรฐาน | `server/http.ts` (`route()`) | auth + role check + rate-limit + origin check + body validation + error JSON + requestId |
| เซสชัน | `server/auth/session.ts` | cookie-based session, hash token ใน DB, revoke ทุกอุปกรณ์ |
| รหัสผ่าน | `packages/infra/src/password.ts` | Argon2id (m=19456, t=2, p=1) |
| ล็อกอิน | `server/auth/auth.service.ts` | ป้องกัน enumeration, dummy hash, login_failed audit |
| Google OIDC | `server/auth/google.ts` | PKCE + state/nonce ใน Redis (single-use) + ตรวจ JWKS |
| ยืนยันอีเมล / ตั้งรหัสผ่านใหม่ | `server/auth/auth.service.ts` + outbox | token SHA-256, TTL 24 ชม. / 30 นาที |
| Rate limit | `packages/infra/src/rate-limit.ts` | Lua atomic fixed-window บน Redis |
| สิทธิ์ (RBAC) | column `users.role` (member/instructor/admin) + `roles:` ใน `route()` + MCP tools | 3 บทบาท + system owner |
| PDPA | `server/account/account.service.ts` | export ข้อมูล / ลบบัญชี (soft delete) |
| API token (MCP) | `server/account/api-tokens.service.ts` | SHA-256 เก็บ token, สร้างครั้งเดียวเห็นครั้งเดียว |
| Audit | `server/audit.ts` | append-only (trigger กันแก้/ลบ) |
| Session security | login → rotate session id, cookie `__Host-` เมื่อ https | กัน fixation/hijack |

## 2. เมทริกซ์สิทธิ์ที่เปิดใช้งานแล้ว

| ความสามารถ | ประชาชน (member) | ครู (instructor) | ผู้ดูแล (admin) |
|---|---|---|---|
| สมัคร / ล็อกอิน (รหัสผ่าน + Google) | ✅ | ✅ | ✅ |
| เรียน + heartbeat กันโกง + checkpoint | ✅ | — | — |
| สอบก่อน/หลังเรียน + ใบรับรอง Ed25519 | ✅ | — | — |
| สมัครรอบอบรม (cohort) | ✅ | — | — |
| สร้าง/แก้ไข/จัดลำดับบทเรียน + คำถาม + เผยแพร่หลักสูตร | — | ✅ (หลักสูตรของตัวเอง) | ✅ (ทุกหลักสูตร) |
| จัดการสมาชิก (บทบาท/สถานะ/รีเซ็ตรหัส/ไล่ออกทุกอุปกรณ์/ยืนยันอีเมลให้) | — | — | ✅ |
| หลักสูตร → อนุมัติ/ระงับ, เพิกถอนใบรับรอง | — | — | ✅ |
| โปรแกรม + รอบอบรม + ประกาศประชาสัมพันธ์ | — | — | ✅ |
| ตั้งค่าอีเมล (SMTP) + Google OAuth | — | — | ✅ |
| กลุ่มผู้เรียน + มอบหมายงาน | — | — | ✅ |
| MCP (tools 15 ตัว ตาม role) | ✅ (ข้อมูลตัวเอง) | ✅ + หลักสูตรตัวเอง | ✅ ทั้งหมด |

System owner (`users.is_system_owner`): บัญชี username-only ที่ admin แก้ไขเองไม่ได้ ป้องกัน lockout

## 3. วิธีคัดลอกไปโครงการใหม่ (แทนการเขียนใหม่)

1. คัดลอก `server/auth/*`, `server/account/*`, `server/audit.ts`, `server/http.ts`, `server/context.ts`, `server/rate-keys.ts` ไปใช้ทั้งโฟลเดอร์
2. คัดลอก migrations: `0001_init` (16 ตารางหลัก: users, user_sessions, email_verification/password_reset tokens, audit_logs, email_outbox), `0007` (google_oauth_settings), `0010` (user_profiles ตาม PDPA), `0017` (user_api_tokens)
3. ตั้ง env: `SETTINGS_ENCRYPTION_KEY`, `REDIS_URL`, `APP_ORIGIN`, `SYSTEM_OWNER_*`, `GOOGLE_*` (optional), `SMTP_URL`
4. ทุก route ใหม่เขียนผ่าน `route()` อย่างเดียว → ได้ auth + role + rate limit + audit ฟรี
5. UI: `app/(auth)/login|register|forgot-password|reset-password|verify-email` + `app/(lms)/me/*` เป็นแม่แบบ

## 4. การปรับเป็นหลายองค์กร (multi-tenant) — สิ่งที่ต้องเพิ่มเท่านั้น

ถ้าจะเปิดให้หลายองค์กรใช้ระบบเดียวกัน (ไม่ต้องเขียนสมาชิกใหม่):

| เรื่อง | สิ่งที่เปลี่ยน |
|---|---|
| โครงสร้างข้อมูล | เพิ่มตาราง `organizations` + column `org_id` ที่ users/courses/programs/enrollments/certificates |
| การสมัคร | เพิ่มหน้า "สร้างองค์กร" (องค์กรแรก = owner ของ org) + invite member |
| สิทธิ์ | เพิ่ม role ระดับ org: `org_admin` (จัดการใน org ตัวเอง) — กลไก `roles:` เดิมรองรับแล้ว |
| การแยกข้อมูล | เพิ่ม `org_id` ใน WHERE ของทุก query + RLS (PostgreSQL row-level security) กันรั่วข้าม org |
| โดเมนต่อ org | เพิ่ม `org_subdomain` + ตรวจใน `route()` (ต้นแบบ: `isAllowedOrigin` เดิม) |
| การสลับ org | session เก็บ `active_org_id` + dropdown ใน shell |

จุดสำคัญ: **ไม่ต้องเปลี่ยน auth framework** — ระบบนี้คือ "Starter Kit" ที่เทียบเท่า Laravel Starter Kit/Better Auth/SuperTokens แล้ว สิ่งที่เพิ่มคือ layer องค์กร (schema + filter) ไม่ใช่ระบบสมาชิกใหม่

## 5. เช็กลิสต์พร้อมใช้งาน (per-role)

- [x] ผู้เรียน: สมัคร→ยืนยัน→เรียน→สอบ→ใบรับรอง→ตรวจสอบใบรับรองสาธารณะ
- [x] ครู: สร้างหลักสูตร→บทเรียน→คำถาม→checkpoint→เผยแพร่→ดูสถิติผู้เรียน
- [x] ผู้ดูแล: สมาชิก/หลักสูตร/โปรแกรม/รอบอบรม/ประกาศ/อีเมล/Google/กลุ่ม/งาน/audit
- [x] ความปลอดภัย: rate limit, CSRF origin, session rotation, PDPA, audit append-only
- [x] MCP: เข้าถึงข้อมูลตาม role ด้วย API token
- [ ] Production: SMTP จริง (หรือใช้ Google login), สร้างบัญชีครูจริง, seed หลักสูตรแรก
