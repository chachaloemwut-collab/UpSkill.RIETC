# มาตรฐานการทำงานร่วมกัน (Contributing Standard)

ใช้สำหรับผู้พัฒนา **มนุษย์ทุกคน** และ **AI agents** (codex/Claude/GPT/CI) ที่ทำงานใน repo นี้
กติกาสั้นสำหรับ agent อยู่ใน [AGENTS.md](../AGENTS.md) — ไฟล์นี้คือเวอร์ชันเต็ม

## 1. ทำไมต้องมีมาตรฐานนี้

ทีมทำงานพร้อมกันบน repo เดียว (มนุษย์ + หลาย agent) เคยเกิดเหตุจริงมาแล้ว: push ชนกัน, ไฟล์ผสมรุ่น,
git object พัง, deploy ขึ้น server ไปครึ่ง ๆ — มาตรฐานนี้คือกันเหตุซ้ำ เป้าหมาย: **งานใครงานมัน มองเห็นกันตลอด และ main ใช้ deploy ได้เสมอ**

## 2. โมเดลการทำงาน (Git Flow แบบเบา)

```
main (protected: PR-only + CI ต้องเขียว)          ← สาย deploy เสมอ
 └── feat/<งาน>        (เจ้าของคนเดียว)  ── PR ──►  merge เข้า main
 └── fix/<งาน>         (เจ้าของคนเดียว)  ── PR ──►  merge เข้า main
```

- **1 สาขา = 1 งาน = 1 เจ้าของ** — ไม่มีใคร push ข้ามสาขาคนอื่น
- งานทุกชิ้นเข้า `main` ผ่าน **Pull Request** เท่านั้น (branch protection บังคับ)
- เริ่มงานใหญ่ด้วย Issue ก่อน → แตกสาขาจาก main ล่าสุด (`git pull` ก่อนสร้างสาขาเสมอ)
- PR เปิดได้ตั้งแต่ draft เพื่อประกาศว่ากำลังทำอะไร (กันไฟล์ชนกัน)

## 3. Commit Message — Conventional Commits

```
feat(admin): สร้างระบบเชิญผู้สอน   |  fix(db): แก้ constraint payload_version
docs: เพิ่มคู่มือนักพัฒนา          |  ci: workflow deploy ผ่าน GHCR
style(ui): ปรับปุ่มรองรับจอสัมผัส  |  chore: อัปเดต dependency
```

- 1 commit = 1 เรื่อง; เขียน **ว่าทำอะไร และทำไม** (บรรทัด body อธิบายบริบท + ผลกระทบ)
- ห้าม commit ข้อความ `.` หรือว่าง — ถ้าเห็นของใครส่ง PR แก้ทันที

## 4. Definition of Done — ตรวจก่อนส่ง PR ทุกครั้ง

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
pnpm typecheck          # ทุก package ที่แตะ
pnpm lint
pnpm test
pnpm test:e2e           # เมื่อแตะ flow หลัก (web+worker ต้องรันอยู่)
pnpm content:check      # เมื่อแตะข้อความหน้า UI
```

- Migration: **additive เท่านั้น** (แอปเวอร์ชันเก่าต้องทำงานต่อได้) → `pnpm db:migrate && pnpm db:codegen` → commit `generated.ts` → ระบุใน PR ว่า compatible กับเวอร์ชันที่รันอยู่
- ระบุหลักฐานใน PR (ผล test, screenshot UI ถ้ามี)

## 5. การสื่อสารระหว่างทีม

| ช่องทาง | ใช้เมื่อ |
|---|---|
| GitHub Issue | ปัญหา, ข้อเสนอ, งานใหญ่ — **เปิดก่อนลงมือเสมอ** |
| Draft PR | ประกาศว่ากำลังทำอะไร (ตั้งแต่ชั่วโมงแรก ไม่ใช่หลังเสร็จ) |
| Commit message | บันทึกถาวรว่าทำอะไร/ทำไม |
| PR description + review comment | พูดคุยรายละเอียด, ขอแก้, ยืนยัน |

- **ไฟล์เดียวกันห้ามแก้พร้อมกัน 2 คน** — เช็ก PR ที่เปิดอยู่ก่อนเริ่มงาน ถ้าจำเป็นต้องแตะไฟล์เดียวกัน ให้ตกลงลำดับใน Issue ก่อน
- งานค้างใน working tree คือ "ของกลาง" — อย่า `reset --hard` / `checkout .` / `clean -fdx` ขณะมีคนอื่นทำงาน (กติกาเต็มใน AGENTS.md)

## 6. การ release (เฉพาะผู้ที่ได้รับมอบ)

1. โค้ดพร้อมบน `main` + CI เขียว (check/e2e/secrets-scan/codeql)
2. `gh workflow run deploy-jasmine.yml --ref main -f migration_compatible=true` (ยืนยัน migration compatible ก่อน!)
3. อัปโหลด `jasmine-release.json` ขึ้น SFTP: `…/jasmine-release.json.tmp` → rename เป็น `…/jasmine-release.json` (เมื่ออัปโหลดครบ)
4. ฝั่ง Hosting ดีพลอยเอง — ดูรายละเอียดทั้งหมดที่ [docs/DEPLOY.md](DEPLOY.md) + [docs/DEVELOPER_HANDBOOK.md](DEVELOPER_HANDBOOK.md) หัวข้อ 8

## 7. การแก้เหตุฉุกเฉิน (hotfix)

1. แจ้งใน Issue ทันที (ว่ากำลังแก้, แตะไฟล์ไหน)
2. สาขา `fix/<เรื่อง>` จาก main → แก้ + ตรวจครบ (หัวข้อ 4) → PR → merge
3. รัน release ตามหัวข้อ 6 — **ห้าม push ตรง main ห้าม force**

## 8. Ownership ตามพื้นที่ (ดู .github/CODEOWNERS)

| พื้นที่ | ผู้ดูแลหลัก |
|---|---|
| `apps/web`, `packages/core` | ทีม app |
| `packages/db/migrations`, `packages/db/src/generated.ts` | ทีม data |
| `infra/docker`, `.github/workflows`, `deploy/` | ทีม deploy |
| `docs/` | ผู้เขียนทุกคน (อัปเดตตามงานตัวเอง) |

— ถ้าจะแตะพื้นที่ของคนอื่น: เปิด Issue/PR ให้เจ้าของพื้นที่ review ก่อนเสมอ
