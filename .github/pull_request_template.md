## สรุปการเปลี่ยนแปลง

<!-- อธิบายว่าทำอะไร/ทำไม สั้น ๆ 2-3 บรรทัด -->

## ประเภท

- [ ] feat (ฟีเจอร์ใหม่)
- [ ] fix (แก้บั๊ก)
- [ ] docs / style / refactor
- [ ] ci / deploy
- [ ] migration (ฐานข้อมูล)

## Checklist

- [ ] `pnpm typecheck` + `pnpm lint` ผ่าน (ทุก package ที่แตะ)
- [ ] `pnpm test` ผ่าน
- [ ] แตะ flow หลัก → `pnpm test:e2e` ผ่าน
- [ ] แตะข้อความหน้า UI → `pnpm content:check` ผ่าน
- [ ] migration ใหม่ → additive เท่านั้น + `pnpm db:codegen` + commit `generated.ts` + **ยืนยันว่าใช้ร่วมกับแอปเวอร์ชันที่กำลังรันอยู่ได้**
- [ ] ไม่ push ตรง `main` (PR นี้จะถูก merge ผ่าน GitHub)

## หลักฐาน

<!-- ผล test, ลิงก์ CI run, screenshot UI, หรือคำอธิบายการทดสอบด้วยมือ -->

## หมายเหตุสำหรับ reviewer

<!-- จุดที่อยากให้ตรวจเป็นพิเศษ, trade-off ที่ตัดสินใจ, งานที่เหลือ -->
