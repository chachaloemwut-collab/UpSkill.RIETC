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

## 2026-11-18T10:45:00+00:00 (17:45 Asia/Bangkok) — Claude Code (lease owner "human"): learner UX + learning units

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
