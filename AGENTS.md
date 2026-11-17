# กติกาสำหรับ AI agents และเครื่องมืออัตโนมัติที่ทำงานใน repo นี้

ไฟล์นี้คือ "กฎจราจร" ที่ agent ทุกตัว (รวมทั้ง codex, Claude, GPT และเครื่องมือ CI) ต้องทำตาม
จุดประสงค์: ให้ผู้พัฒนาหลายคน/หลาย agent ทำงานพร้อมกันได้โดยงานไม่เละ (อิงจากอุบัติเหตุจริงที่เคยเกิด — ดู docs/DEVELOPER_HANDBOOK.md หัวข้อ 10)

## 1. สาขา (Branch) — หนึ่งงาน หนึ่งสาขา หนึ่งเจ้าของ

- `main` = สาย deploy ห้าม push ตรง (มี branch protection บังคับ PR) — งานทุกชิ้นเข้าก่อน release ผ่าน PR เท่านั้น
- สร้างสาขาแยกตามงาน: `feat/<ชื่อ>` หรือ `fix/<ชื่อ>` — **ห้ามแก้โค้ดในสาขาของผู้อื่นโดยตรง** ถ้าต้องแก้ ให้เปิด PR เข้าไปแทน หรือเขียน comment/issue
- สาขาที่ agent ใดกำลังทำงานอยู่ ให้ถือว่าเป็นของ agent นั้นทั้งสาขา (รวมไฟล์ที่ยังไม่ commit)

## 2. Commit และการ push

- Commit message ใช้ **Conventional Commits**: `feat(scope): ...`, `fix(scope): ...`, `docs:`, `style(ui):`, `ci:`, `chore:` — ประโยคเป็นภาษาอังกฤษหรือไทยก็ได้ แต่อย่า commit ข้อความ "." หรือว่าง
- 1 commit = 1 เรื่อง; อย่ามัดงานหลายเรื่องใน commit เดียว
- **ก่อน commit ทุกครั้ง**: `git status` (ห้าม `git add -A` โดยไม่ดูว่ามีไฟล์ของคนอื่นติดมาด้วย) + รัน `pnpm typecheck` และ `pnpm lint` อย่างน้อย — งานที่ typecheck ไม่ผ่านห้าม push
- ห้าม `push --force` ไปยังสาขาที่แชร์หรือมีใครอ่านอยู่; `--force-with-lease` เฉพาะสาขาตัวเอง + เมื่อแน่ใจ
- push แล้วเจอ non-fast-forward → **ดึงมารวม (rebase/merge) ห้าม force ทับ**

## 3. ห้ามเด็ดขาด (เคยทำให้ repo พังมาแล้ว)

- ❌ ห้ามรัน `git gc`, `git prune`, `git reset --hard`, `git checkout .`, `git clean -fdx` ขณะมีผู้พัฒนาคนอื่น/agent อื่นทำงานอยู่ — ก่อนรันใด ๆ ต้องสำรอง working tree (tar) ก่อนเสมอ
- ❌ ห้ามแก้ migration ที่ apply ไปแล้ว (มี checksum) — เขียน migration ใหม่แทน
- ❌ ห้ามลบ/ถอด: `outputFileTracingIncludes` + `publicHoistPattern` (argon2), `COPY --chown=10001:10001` (Docker), check constraint `payload_version` 1–4 — ทั้งหมดเคยพัง production จริง
- ❌ ห้าม push ไป `main` โดยตรง (branch protection จะปฏิเสธ — ถ้าเห็น error อย่าหาทางเลี่ยง)

## 4. การตรวจก่อนส่งงาน (Definition of Done)

- [ ] `pnpm typecheck` (ทุก package ที่แตะ) และ `pnpm lint` ผ่าน
- [ ] `pnpm test` ผ่าน; ถ้าแตะ flow หลัก → `pnpm test:e2e` ผ่าน (ต้องมี web+worker รันอยู่)
- [ ] แตะข้อความหน้า UI → `pnpm content:check` ผ่าน
- [ ] migration ใหม่ → additive เท่านั้น + `pnpm db:codegen` + commit generated.ts + ยืนยันว่าใช้ร่วมกับแอปเวอร์ชันที่กำลังรันอยู่ได้
- [ ] เปิด PR พร้อมเทมเพลตครบ (ลิงก์ test/หลักฐาน)

## 5. การสื่อสารระหว่างผู้พัฒนา/agent

- ประกาศงานที่กำลังทำใน PR (แม้ draft) — อย่าทำเงียบ ๆ หลายชั่วโมงแล้ว push ทีเดียว
- ไฟล์เดียวกันห้ามแก้พร้อมกัน; ถ้าจำเป็น ให้ตกลงลำดับใน PR/issue ก่อน
- Commit message คือบันทึกการสื่อสารหลัก — เขียนให้คนถัดไปรู้ว่าทำอะไร/ทำไม
- ปัญหา/ข้อเสนอ → GitHub Issue ก่อนลงมือเสมอสำหรับงานใหญ่

## 6. Environment

- ต้องใช้ **Node.js 24**: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` ทุกคำสั่ง (default ของเครื่องอาจเป็น v16)
- พอร์ต 3000 มี dev server เดิมรันอยู่ — อย่าเปิดซ้ำ
- secret ทั้งหมดอยู่ใน `.env.local`/`deploy/jasmine/secrets/` (gitignored) — ห้าม commit ห้ามแชร์ในข้อความสาธารณะ

## 7. กติกากลางตามเวลาและการส่งต่อ (Antigravity / DeepSeek / ChatGPT)

ก่อนทุกงานต้องอ่าน `docs/AI_COLLABORATION.md` และ `docs/AI_HANDOFF.md` แล้วรัน
`python3 scripts/agent-work.py status` และจองสิทธิ์ก่อนเขียน ห้ามแก้ซ้อนกับผู้ถือสิทธิ์
อัปเดต heartbeat ทุก 10 นาที; stale 30 นาทีไม่อนุญาตให้ยึดงานอัตโนมัติ
บันทึกผลพร้อมเวลาและ commit แล้ว finish ก่อนส่งต่อ ห้าม deploy เปลี่ยนรหัสผ่านบัญชีผู้ดูแล
