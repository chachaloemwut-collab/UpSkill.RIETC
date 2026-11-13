# สถานะการพัฒนาระบบ

ตรวจล่าสุดวันที่ 13 พฤศจิกายน 2026 จาก source code, unit test, typecheck, lint และ end-to-end test บน PostgreSQL, Redis, Mailpit, Next.js และ worker จริงในเครื่องพัฒนา

## หลักการกำหนดสถานะ

- **ผ่าน E2E**: ทดสอบเส้นทางผ่าน HTTP, queue และฐานข้อมูลจริงแล้ว
- **ผ่าน unit/static**: มีกฎธุรกิจหรือโค้ดรองรับและชุดตรวจผ่าน แต่ยังไม่ยืนยันกับบริการภายนอกหรืออุปกรณ์จริง
- **บางส่วน**: ใช้งานในเครื่องพัฒนาได้ แต่ยังขาดองค์ประกอบสำหรับ production
- **ยังไม่ทำ**: มีเพียง interface, เอกสารแนวทาง หรือยังไม่มี implementation

## ฟังก์ชันที่สร้างแล้ว

| ขอบเขต | สถานะ | หลักฐานที่ตรวจ |
|---|---|---|
| สมัครสมาชิกด้วยอีเมลและรหัสผ่าน | ผ่าน E2E | สร้างบัญชี, ปฏิเสธรหัสผ่านไม่ผ่านเกณฑ์, ป้องกัน email enumeration |
| ยืนยันอีเมลและเข้าสู่ระบบ | ผ่าน E2E | ลิงก์จาก Mailpit ใช้ได้ครั้งเดียว, session cookie เป็น HttpOnly/SameSite |
| ลืมและเปลี่ยนรหัสผ่าน | ผ่าน E2E | token ใช้ครั้งเดียวและยกเลิก session เดิมทั้งหมด |
| บทบาท member, instructor, admin | ผ่าน E2E | member เรียก API ผู้สอน/ผู้ดูแลไม่ได้ และมีการป้องกัน IDOR |
| สร้างและเผยแพร่หลักสูตร | ผ่าน E2E | เพิ่มวิดีโอ YouTube, บังคับเกณฑ์บทเรียน/เวลา/ข้อสอบก่อนเผยแพร่ |
| ลงทะเบียนและเข้าเรียน | ผ่าน E2E | ลงทะเบียนหลักสูตรที่เผยแพร่และเริ่ม learning session ได้ |
| ติดตามเวลาและความคืบหน้า | ผ่าน E2E | heartbeat ฝั่ง server, ป้องกัน replay, position jump และการเปิดซ้ำหลายแท็บ |
| แบบทดสอบท้ายหลักสูตร | ผ่าน E2E | ต้องเรียนครบก่อน, ไม่ส่งเฉลยไป client, สุ่ม option id, ตรวจคะแนนฝั่ง server |
| ชื่อผู้รับใบรับรอง | ผ่าน E2E | ผู้เรียนยืนยันชื่อก่อนออกใบรับรอง และฐานข้อมูลล็อกไม่ให้แก้ภายหลัง |
| ออกใบรับรอง | ผ่าน E2E | ออกซ้ำแบบ idempotent, ลงนาม Ed25519, ส่งงานสร้าง PDF ผ่าน queue |
| ดาวน์โหลดและตรวจสอบใบรับรอง | ผ่าน E2E | เจ้าของดาวน์โหลด PDF ได้, หน้าสาธารณะตรวจ valid/tampered/revoked ได้ |
| เพิกถอนใบรับรอง | ผ่าน E2E | admin ระบุเหตุผลและสถานะปรากฏใน API/หน้าตรวจสอบสาธารณะ |
| ผู้สอนและผู้ดูแลระบบ | ผ่าน unit/static และเส้นทางสำคัญผ่าน E2E | จัดการหลักสูตร/บทเรียน/ข้อสอบ, สถานะผู้ใช้, หลักสูตร และเหตุการณ์ผิดปกติ |
| ตรวจข้อความที่ไม่มีข้อกำหนดรองรับ | ผ่าน static | `pnpm content:check` ตรวจคำสัญญาด้านราคา/การให้บริการที่ยังไม่ได้รับอนุมัติ |

ผลตรวจล่าสุด: unit test 63 รายการผ่านทั้งหมด, E2E 34 รายการผ่านทั้งหมด, TypeScript และ ESLint ผ่าน

## ฟังก์ชันที่ยังไม่สมบูรณ์สำหรับ production

| ขอบเขต | สถานะปัจจุบัน | งานที่ต้องทำต่อ |
|---|---|---|
| Google Sign-In | บางส่วน | โค้ด OIDC และ account linking มีแล้ว แต่ต้องกำหนด client credentials และทดสอบกับ Google จริง |
| ตรวจวิดีโอ YouTube | บางส่วน | local ใช้ fallback duration ได้; production ต้องมี API key และติดตาม quota/error |
| ที่เก็บไฟล์ PDF | บางส่วน | local disk ใช้งานได้; production ต้องใช้ private object storage และ signed download |
| ความเข้ากันได้ของอุปกรณ์ | ยังไม่ยืนยัน | ทดสอบ iOS Safari, Android Chrome, iPad Split View และ in-app browser ด้วยอุปกรณ์จริง |
| การ deploy และ recovery | ยังไม่ทำ | reverse proxy/TLS, secret manager, migration release step, backup และ restore drill |
| Monitoring และ alert | ยังไม่ทำ | metrics/log aggregation, BullMQ failed jobs, tampered verification และ anticheat rate alerts |
| การจัดการไฟล์ใบรับรองระยะยาว | ยังไม่ทำ | retention policy, key rotation runbook และการตรวจ object integrity ตามรอบ |

## แนวทางพัฒนาให้ยืดหยุ่นและครอบคลุม

1. รักษากฎธุรกิจใน `packages/core` ให้ไม่มี I/O และทดสอบด้วย unit test
2. ให้ route handler ทำเฉพาะ validate/auth/rate-limit แล้วเรียก service ใน `apps/web/src/server`
3. เปลี่ยน schema ด้วย migration แบบ forward-only และสร้าง type จาก schema จริงทุกครั้ง
4. แยกงานช้า เช่น PDF, อีเมล และตรวจวิดีโอ ไป worker พร้อม retry และ dead-letter/alert
5. ใช้ interface ของ storage เพื่อสลับ local disk เป็น object storage โดยไม่เปลี่ยน flow ผู้เรียน
6. เพิ่ม E2E ทุกครั้งที่แก้เส้นทาง สมัครสมาชิก → ลงทะเบียน → เรียน → สอบ → ออกใบรับรอง
7. ให้ข้อความหน้าผู้ใช้บอกเฉพาะความสามารถที่มีข้อกำหนดและหลักฐานรองรับ; ห้ามเพิ่มข้อเสนอ ราคา หรือคำรับรองเอง
8. แยกค่าที่ต่างกันตาม environment ผ่าน `APP_ENV` และ secret manager ไม่ฝังค่า production ใน source code

## ลำดับงานถัดไปที่แนะนำ

1. เปลี่ยน PDF storage เป็น private S3-compatible storage พร้อม signed URL และ integration test
2. เพิ่ม production observability และแจ้งเตือน queue/verification/security events
3. ทำ release pipeline ที่รัน migration, unit, typecheck, lint และ E2E ก่อน deploy
4. ทดสอบอุปกรณ์จริงและบันทึกผลแยกตาม browser/version
5. ทำ backup/restore drill และ key-rotation drill ก่อนเปิดใช้งานจริง
