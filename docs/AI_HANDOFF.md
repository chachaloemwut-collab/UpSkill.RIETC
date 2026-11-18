# บันทึกส่งต่องานร่วมกัน

เพิ่มรายการตามเวลาจริง ห้ามใส่ secrets ใช้ผลตรวจปัจจุบันแทนการเดาประวัติ

## แบบฟอร์ม

- เวลา UTC / Asia-Bangkok:
- โปรแกรม / งาน / ขอบเขต:
- Branch / commit:
- ไฟล์ที่แก้ / ไฟล์ยังไม่ commit:
- ตรวจผ่าน (คำสั่ง/หลักฐาน):
- ยังไม่ตรวจ / ปัญหาที่ค้าง:
- Production เปลี่ยนหรือไม่:
- ขั้นตอนถัดไป / ผู้รับช่วง:

## 2026-11-17T08:57:05+00:00 — ChatGPT: shared coordination setup

- ติดตั้งกติกากลางและเครื่องมือจองงาน ยังไม่มีการ commit/push หรือเปลี่ยน branch
- ทดสอบจองงาน, ปฏิเสธงานชน, ปฏิเสธ token ผิด, heartbeat และส่งต่อผ่านใน repository ชั่วคราว
- ไม่เปลี่ยน production หรือรหัสผ่านบัญชีผู้ดูแล
- Antigravity/DeepSeek ยังไม่ได้ยืนยันการอ่านกติกาในแชตเก่า ให้สั่งอ่านก่อนรับงานถัดไป
- สถานะ deploy และบัญชี superadmin ต้องตรวจสดก่อนดำเนินการ ห้ามถือว่าการ publish สำเร็จเท่ากับ deploy สำเร็จ

## 2026-11-18T10:40:51+00:00 (17:40 Asia/Bangkok) — Claude Code (lease owner "human"): learner UX + learning units

- งาน / ขอบเขต: หน่วยการเรียนรู้ (course_units), โหมดดูวิดีโอ free_complete, เกณฑ์ผ่าน lesson_tests_average,
  player controls, หน้าผู้สอนจัดการหน่วย, สคริปต์นำเข้าหลักสูตร "การจัดทำกระทงรักษ์โลกเพื่อการประกวด"
- Branch / commit: `feat/learner-units-free-navigation` (e6873af..aa02b96 + docs commit นี้), PR #18 (ยังไม่ merge)
- Migration ใหม่: `0024_course_units_and_completion_rules.sql` (additive; apply แล้วบน dev DB 55432 เท่านั้น)
- ตรวจผ่าน: `pnpm typecheck`, `pnpm lint` (+content:check), `pnpm test`, e2e `units.e2e.ts` 11/11,
  `pnpm test:e2e` 87/88 — ข้อที่ล้มคือ PDF ใบรับรอง: worker บนเครื่องนี้ไม่มี Playwright Chromium (env)
- Dev DB: นำเข้า `krathong-contest-2569` (published) ไว้ทดสอบแล้ว
- เหตุการณ์ repo: `~/Documents` ถูก iCloud sync → มีไฟล์ซ้ำ " 2"/" 3" ทั้งใน working tree และใน `.git`
  (`refs/heads/main 2`, `index 2`, lock ค้าง) ทำให้ fetch และ migrate ล้ม ย้ายไปสำรองนอก repo แล้ว (ไม่ได้ลบ)
  ควรย้าย repo ออกจากโฟลเดอร์ที่ iCloud sync เพื่อไม่ให้เกิดซ้ำ
- Production เปลี่ยนหรือไม่: ไม่ (ยังไม่ deploy และยังไม่ได้รันสคริปต์นำเข้าบนเซิร์ฟเวอร์)
- ขั้นตอนถัดไป: รอผู้ใช้ยืนยัน → merge PR #18 → deploy ผ่าน workflow Jasmine (migration_compatible=true) →
  ใน worker container รัน `node --import tsx src/import-krathong-contest.ts` (dry-run) แล้วจึง `--apply`
  พร้อมตัดสินใจเรื่อง `--publish` / `--archive krathong-rak-lok` / `--instructor-email`

## 2026-11-18T12:16:06+00:00 (19:16 Asia/Bangkok) — Claude Code (lease owner "human"): production release 99dfb0a + course import

- Release: PR #18 (units/free navigation/combined score) + PR #19 (security: no hardcoded developer test password) →
  main `99dfb0a` → CI ✅ → Deploy Jasmine run 44299749297 ✅ → manifest uploaded 12:03 UTC via SFTP
- เส้นทาง release ที่ตกลงกับ hosting: manifest + `jasmine-release.timer` (เปิดถาวร), ดูผลที่ `/files/jasmine-release-status.json`
  ช่องทาง `deployer` แบบเดิมถูก hosting ปฏิเสธ (build/restart/migrate ได้) — ห้ามขอเปิด และควรลบออกจาก repo
- ตรวจจริง: `/api/instructor/courses/<id>/units/order` 404 → 401 (โค้ดใหม่ทำงาน), `/api/health` ok,
  ล็อกอิน superadmin หลัง deploy ผ่าน (HTTP 200) โดยไม่แก้บัญชี
- ข้อสังเกต: ไฟล์สถานะยังแสดง last_attempt `d6608bb` และ manifest ยังอยู่บนเซิร์ฟเวอร์ แม้โค้ดใหม่ทำงานแล้ว → แจ้ง hosting ตรวจตัวสรุปสถานะ
- นำเข้าหลักสูตรผ่าน API ของเว็บด้วยบัญชีเจ้าของระบบ (ไม่ใช้ shell): "การจัดทำกระทงรักษ์โลกเพื่อการประกวด" `/courses/course-2bd238`
  4 หน่วย / 10 คลิป (ความยาวตรงตามแผน 1:19:57) / ข้อสอบท้ายคลิป 10 ข้อ / free_complete + lesson_tests_average 80% / เผยแพร่แล้ว
  หลักสูตรเดิม `course-889218` → archived (ผู้เรียนเดิมเก็บความคืบหน้าและใบรับรอง) ผู้สอนคนเดิม
- ยังไม่ได้ทดสอบ: ผู้เรียนจริงเรียนจบและรับประกาศนียบัตรบน production, การกู้คืน backup ฐานข้อมูล (hosting ยังไม่ได้ซ้อม)
- ห้าม release ช่วงรับผลงานประกวด จันทร์ 23 พ.ย. 2569 17:30–18:30

## 2026-11-18T13:05:52+00:00 (20:05 Asia/Bangkok) — Claude Code (lease owner "human"): release d520a86

- Merged: PR #20 (release log), #21 (admin certificate PDF link fix + 3-step sign-up), #22 (per-course application form
  ใบสมัคร, course types, landing without featured course; migration 0025 additive)
- main CI 44308598275 ✅ → Deploy Jasmine 44309204797 ✅ → manifest uploaded 13:03 UTC → live 13:05 UTC
  (`/api/courses/<id>/application` 404→401); status file: last_attempt d520a86 ok, rolled_back_to null
- Verified live: /api/health ok, landing shows course types (no featured course), catalog ?type= filter 200,
  register page 3 steps, krathong course page unchanged (4 units), admin certificates page has no /pdf links,
  superadmin login 200 (one attempt, account untouched)
- Not done yet: file uploads for application documents (needs generic storage + hosting proxy body-size limit),
  certificate signer line for the krathong course still shows the owner account ("เจ้าของระบบ") — awaiting user decision
