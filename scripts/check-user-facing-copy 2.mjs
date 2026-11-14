import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const ROOTS = ["apps/web/src/app", "apps/web/src/components"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

// ข้อความเหล่านี้สร้างเงื่อนไขด้านราคา การให้บริการ หรือความพร้อมใช้งานที่ข้อกำหนดยังไม่ได้ระบุ
// แก้รายการนี้เมื่อมีข้อกำหนดที่ได้รับการยืนยันแล้วเท่านั้น
const DISALLOWED_PHRASES = [
  "เรียนฟรี",
  "สมัครสมาชิกฟรี",
  "เริ่มเรียนฟรี",
  "ลงทะเบียนเรียน (ฟรี)",
  "Open-access LMS",
  "กลับมาใหม่เร็ว ๆ นี้",
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = (await Promise.all(ROOTS.map(sourceFiles))).flat();
const violations = [];

for (const file of files) {
  const lines = (await readFile(file, "utf8")).split("\n");
  for (const [index, line] of lines.entries()) {
    for (const phrase of DISALLOWED_PHRASES) {
      if (line.includes(phrase)) violations.push(`${relative(process.cwd(), file)}:${index + 1}: ${phrase}`);
    }
  }
}

if (violations.length) {
  console.error("พบข้อความที่ยังไม่มีข้อกำหนดรองรับในหน้าผู้ใช้:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`ตรวจข้อความหน้าผู้ใช้แล้ว ${files.length} ไฟล์`);
}
