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

## 2026-11-18T16:17:03+00:00 (23:17 Asia/Bangkok) — Claude Code (lease owner "human"): releases 1845e91 + 97ee46f

- 1845e91 (PR #24): fixed the instructor "ผู้เรียน" tab crash (roster read `items`, API returns `learners`) and the
  developer test certificate being re-issued in a real course after the oldest course was archived (now one ever).
  The hosting receiver missed the first manifest write (status stayed d520a86 for 10 min); re-uploading the same
  manifest applied it immediately.
- 97ee46f (PR #25, migration 0026): document file uploads on course applications (PDF/JPG/PNG ≤ 5 MB, sniffed,
  owner/applicant-only download, erased with the account). Hosting proxy measured: accepts ≥ 20 MB request bodies.
- Production data change (via owner account, no deploy): krathong course certificate signer =
  "วิทยาลัยเทคนิคนิคมอุตสาหกรรมระยอง", signer title cleared.
- Verified live: status 97ee46f ok, all editor tabs load (incl. learners), superadmin login 200 (account untouched).
- Left as is (needs owner decision): the developer account cha.chaloemwut@gmail.com has a "completed" enrollment +
  TEST certificate CERT-2026-CZVY-1K37-EK19 in the krathong contest course (created by the old PR #17 logic).
- Local dev server (running since 2026-11-14) serves stale Turbopack modules for new/changed server files;
  CI production build is the reliable check until it is restarted.

## 2026-11-18T16:50:41+00:00 (23:50 Asia/Bangkok) — Claude Code: audit batch 1 (PR #28, 1421795)

- งาน / ขอบเขต: Functional Flexibility Audit batch 1 (A01, A05, A07, A08)
- Branch / commit: `fix/audit-batch-1` → squash merged to main as 1421795 (PR #28)
- ไฟล์ที่แก้:
  - `apps/web/src/components/admin/CertificatesManager.tsx` — A01: validate score 0–100 before submit (เดิม `|| 100` ทำให้ 0 กลายเป็น 100)
  - `apps/web/src/components/admin/EnrollmentAdminActions.tsx` — A01: prompt for score instead of hardcoded 100
  - `apps/web/src/server/certificates/issue.service.ts` — A05: per-course score via completion_rule; throws SCORE_UNAVAILABLE if incomplete
  - `apps/web/src/server/admin/certificates.service.ts` — A08: filtered count query for pagination total
  - `apps/web/src/server/admin/users.service.ts` — A07: "dropped" → "revoked"
  - `apps/web/src/app/api/admin/enrollments/[id]/status/route.ts` — A07: "dropped" → "revoked" in zod enum
- ตรวจผ่าน: `pnpm typecheck` clean, `pnpm lint` clean, CI check/codeql/e2e/secrets-scan ✅
- main CI 44349731706 ✅ → Deploy Jasmine bw2evi7td ✅ → live at 2026-11-18T16:50:41+00:00
- Production live check: status 1421795 ok, landing/courses/admin pages 200
- superadmin curl login returned 403 (likely missing CSRF/Origin header in curl — ไม่ได้ retry); deploy script ✅
- ยังไม่ได้ทำ (audit items ที่เหลือ): A02, A03, A04, A06, A09, A10; 1A LessonPlayer stability; B/G/I modules
- dfe2fcc (PR #27, one-command release script) released earlier at 16:40 UTC ✅

## 2026-11-19T00:00:00+00:00 (07:00 Asia/Bangkok) — Claude Code: audit batch 2 (PR #30, 5e60fe5)

- งาน / ขอบเขต: Functional Flexibility Audit batch 2 (A06, H 1A LessonPlayer stability)
- Branch / commit: `fix/audit-batch-2` → squash merged to main as 5e60fe5 (PR #30)
- ไฟล์ที่แก้:
  - `apps/web/src/server/admin/certificates.service.ts` — A06: innerJoin → leftJoin บน courses เพื่อให้ program-level certs (course_id = null) ปรากฏในรายการ admin
  - `apps/web/src/components/admin/CertificatesManager.tsx` — A06: อัปเดต CertificateRow.course_id/course_slug เป็น string | null
  - `apps/web/src/components/learning/youtube-iframe-api.ts` — H 1A: reset loading = undefined ใน onerror ให้ retry ได้ (rejected promise เดิมถูก reuse)
  - `apps/web/src/components/learning/LessonPlayer.tsx` — H 1A: anchor heartbeat หลัง startSession, finalization timer + confirming state, cleanup ref, end overlay spinner "กำลังยืนยันผล…", jumpToUnwatched ทุก mode
  - `apps/web/src/app/(lms)/courses/[slug]/lessons/[lessonId]/page.tsx` — H 1A: เพิ่ม key={lesson.id} บน LessonPlayer บังคับ remount เมื่อนำทางระหว่าง lesson
- ตรวจผ่าน: `pnpm typecheck` clean, `pnpm lint` clean, CI check/codeql/e2e/secrets-scan ✅ (run 44356456956)
- main CI 44357263690 ✅ → Deploy Jasmine bj1lv4cyb ✅ → released 5e60fe5 ✓
- Production live check: ตรวจ superadmin login ในเบราว์เซอร์ (ไม่ใช้ curl — ต้องมี CSRF header)
- ยังไม่ได้ทำ (audit items ที่เหลือ): A02, A03, A04, A09, A10; B/G/I modules
- ยังรอการตัดสินใจ: ลบ/เพิกถอน TEST cert CERT-2026-CZVY-1K37-EK19 ของ developer account บน production

## 2026-11-19T09:54:42+00:00 (16:54 Asia/Bangkok) — Claude Code: release 7b986f7 (audit batch 5 + regression fixes)

- Released 7b986f7 (live เดิม 5e60fe5): audit batch 5 ac01b20 (PR #34) + PR #35 + PR #36; migrations 0027–0037
  ขึ้นพร้อมกัน (additive ทั้งหมด: 0029 ขยาย visibility check แบบ superset, 0033 คอลัมน์ใหม่มี default)
- main CI 44498962539 ✅ → Deploy Jasmine 44499568019 ✅ → `released 7b986f7 ✓` (status file last_attempt ok)
- แก้ก่อน release (batch 5 ทำ e2e แดง):
  - 0036: GRANT `upskill_app` บนตารางที่สร้างหลัง 0002 (`system_settings` ฯลฯ) — สาเหตุ 500 ตอนสร้างคอร์ส
  - quiz tags ส่ง JSON string cast `::text[]` → `malformed array literal` ทุกครั้งที่เพิ่ม/แก้คำถาม
  - announcements: `cohortId`/`scheduledBroadcastAt` default null (เดิมไม่ส่ง = 400)
  - 0037 + fallback: default คอร์สใหม่กลับเป็น linear / ผ่าน 80 / ล็อกลำดับบท / quiz 30 นาที
    (0032 ทำให้หลวมลงโดยไม่ตั้งใจ; อัปเดตเฉพาะเมื่อ admin ยังไม่เคยบันทึก) — admin ปรับเองได้ที่หน้า course defaults
  - migrate runner: โหมด `MIGRATION_SKIP_ROLE_GRANTS=1` ตัด GRANT ใต้ `ALTER DEFAULT PRIVILEGES` แล้วเหลือ prefix ค้าง
    → 0036 จะ syntax error บน production; แก้ + CI รัน migration โหมด single-role ทุกครั้ง
- เหตุการณ์: 8d91a07 ถูก push ตรงเข้า main (ผิดกติกา → branch-guard แดง) แก้ด้วยการ merge PR #35 ทับ;
  release b807f86 ถูกหยุดระหว่าง build image ก่อน upload manifest เมื่อพบปัญหา runner — production ไม่ถูกแตะ
- Live check (read-only): `/api/health` ok, `/login` 200, route ใหม่ (`/api/admin/settings/course-defaults`,
  `/api/admin/categories`, lesson activities) 404→401
- ยังไม่ได้ทำ: ล็อกอิน superadmin หนึ่งครั้ง — session นี้ไม่มีรหัสผ่าน (ไม่เก็บไว้ที่ใดโดยเจตนา) เจ้าของต้องตรวจเอง
- agent-work lease ค้าง (owner human, 2026-11-18 16:23 UTC, stale) — ไม่ได้ยึด/ปิด

## 2026-11-19T15:26:12+00:00 (22:26 Asia/Bangkok) — Claude Code: release 056d953 (landing, วุฒิบัตร, signature, password recovery)

- Released 056d953 (live เดิม 7b986f7) = PR #39 (password management) + PR #38 (landing + certificate); migrations 0038, 0039 (additive)
- main CI 44552706555 ✅ (รวม branch-guard) → Deploy Jasmine 44553605941 → `released 056d953 ✓`
- ก่อน merge #38 ตรวจผลรวมทั้งสอง branch บนเครื่อง: codegen ตรง, typecheck/lint/test ผ่าน
- สิ่งที่ขึ้น:
  - หน้า landing ใหม่ + เมนูมือถือ + ฟอร์มตรวจสอบเอกสารในหน้า + FAQ (ตัดข้อความ "100% Free")
  - วุฒิบัตร: ตรา/ชื่อวิทยาลัยเทคนิคนิคมอุตสาหกรรมระยอง, ถ้อยคำแบบวุฒิบัตรอบรมออนไลน์ (DSD), ไม่พิมพ์คะแนน,
    หน้า verify แสดง "ผ่านเกณฑ์ของหลักสูตร" แทน %; หลักสูตรใหม่ default ชื่อ "วุฒิบัตร" (หลักสูตรเดิมไม่แก้)
  - ลายเซ็นรายหลักสูตร (admin เท่านั้น): แสดงชื่อผู้ลงนามเฉพาะเมื่อเปิดสวิตช์ + มีลายเซ็น + มีชื่อ; snapshot ตอนออก
    (`certificates.signature_key_snapshot`) — ยังไม่มีการอัปโหลดลายเซ็นใดตามคำสั่งเจ้าของ
  - รหัสผ่าน: ลืมรหัสด้วยอีเมลหรือชื่อผู้ใช้; admin ส่งลิงก์อีเมล (1 ชม.), สร้างลิงก์ส่งเอง (24 ชม.),
    รหัสชั่วคราวที่บังคับเปลี่ยน (`users.must_change_password`), ปลดล็อกการเข้าสู่ระบบ, ประวัติรีเซ็ต
    — ทุกเครื่องมือใช้กับ system owner / ตัวเอง / บัญชีไม่ active ไม่ได้
- Live check (read-only): `/api/health` ok; `/`, `/login`, `/forgot-password`, `/reset-password` 200; หน้าแรกมี "วุฒิบัตร";
  `/brand/rietc-emblem.png` 200 image/png; route ใหม่ (certificate-display, course signature) → 401;
  forgot-password รับรูปแบบชื่อผู้ใช้ → 200
- ยังไม่ได้ตรวจ: การ render PDF วุฒิบัตรแบบใหม่บน production (ต้องมีการออกเอกสารจริง), ล็อกอิน superadmin หนึ่งครั้ง
  (session นี้ไม่มีรหัสผ่าน — เจ้าของต้องตรวจเอง)
- ⚠️ ประเด็นความปลอดภัยที่พบ ยังไม่แก้ (ต้องเป็นงานแยกที่เจ้าของสั่ง): `login()` ใน
  `apps/web/src/server/auth/auth.service.ts` มีรหัสผ่านบัญชีเจ้าของระบบเขียนตายตัวในโค้ด และเขียน password hash ทับเมื่อใช้รหัสนั้น
  — ขัดกติกา CREATE-ONLY; ต้องถอดออก + เปลี่ยนรหัสบัญชี (รหัสอยู่ใน git history แล้ว)
- ข้อมูลผิดที่ยังค้าง: สคริปต์ seed กระทง (`complete-krathong-flow.ts`, `krathong-contest-2569.ts`) ใช้ชื่อสถาบันผิด
  ("สถาบันการอาชีวศึกษาภาคตะวันออก…") — ข้อมูลที่ seed ลง production แล้วอาจยังเป็นชื่อเก่า
- agent-work lease ค้าง (owner human, 2026-11-18 16:23 UTC, stale) — ไม่ได้ยึด/ปิด

## 2026-11-21T16:45:00+00:00 (23:45 Asia/Bangkok) — Claude Code: release 24df7b9 (วุฒิบัตรทั้งระบบ, mobile login, admin reports)

- Released 24df7b9 (live เดิม 056d953) = PR #47; migration 0040 (data: courses.credential_name_th → วุฒิบัตร)
- main CI 44924645139 ✅ → Deploy Jasmine 44924980522 → `released 24df7b9 ✓` (hosting receiver ช้า: script อัปโหลด manifest ซ้ำ 2 ครั้งตามกลไกปกติ)
- วุฒิบัตร: ถ้อยคำตามวุฒิบัตรอบรมของ กรมพัฒนาฝีมือแรงงาน / กรมพัฒนาพลังงานทดแทนฯ; ฉบับที่ออกแล้ว → worker re-render PDF
  ทุกฉบับที่ไม่ถูกเพิกถอน ครั้งเดียวต่อ `CERTIFICATE_ARTWORK_VERSION` (`system_settings.certificate_artwork_version`)
  — ไม่แตะ record ที่ลงนาม ไม่ส่งอีเมล ล้มเหลวก็คง PDF เดิม; ทดสอบบนเครื่อง 5/5 ฉบับ
- มือถือ: fallback `/api/auth/login/form` (ล็อกอินได้แม้ JS ไม่ทำงาน), แถบเตือนเบราว์เซอร์เก่า (< iOS/Safari 16.4, Chrome 111, Firefox 128),
  tap target ใหญ่ขึ้น — ทดสอบ WebKit iPhone/iPad + Chromium Android บน production ก่อนแก้: ไม่มี element บังปุ่ม, hydrate ปกติ
- แอดมิน: `/admin/reports` (ตาราง + CSV รายชื่อ/สรุป + PNG + พิมพ์; audit `admin.trainees_exported`), วุฒิบัตร: กรองตามหลักสูตร + ปุ่มดู PDF
- Live check (read-only): health ok; `/admin/reports` 307 (ต้องล็อกอิน); CSV 401; login form fallback ตอบ 303 + BAD_ORIGIN เมื่อไม่มี Origin;
  แถบเตือนขึ้นกับ UA iPadOS 15.7; หน้าแรกไม่มีคำว่า "ใบรับรอง" แล้ว
- ยังไม่ได้ตรวจ: PDF ที่ re-render บน production (ต้องล็อกอินแอดมิน/เจ้าของเอกสาร), ล็อกอิน superadmin (ไม่มีรหัสในเซสชันนี้)
- ⚠️ ยังค้าง: รหัสผ่านเจ้าของระบบเขียนตายตัวใน `login()` (ดูบันทึก release 056d953)
