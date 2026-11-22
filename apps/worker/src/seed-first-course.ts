/**
 * Seed the first real course on a given deployment: clears all course-related demo data and
 * creates "การประดิษฐ์กระทงรักษ์โลกและจริยธรรมสิ่งแวดล้อม" (10 lessons + 10 in-video checkpoints
 * + 10 post-test questions), then publishes it.
 *
 * Run inside the worker image (env comes from compose):
 *   docker compose run --rm worker node --import tsx src/seed-first-course.ts
 *
 * Runs as DATABASE_MIGRATION_URL (owner) because certificates are immutable by design
 * (DELETE trigger + no app grant). Intentionally wipes course data — use deliberately.
 */
import { createDb, sql } from "@upskill/db";
import { getEnv } from "@upskill/infra/env";

const env = getEnv();
// DATABASE_MIGRATION_URL is intentionally outside the runtime env schema (owner-only, like the migrate runner)
const db = createDb(process.env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL);

// 1. Clear course-related data in FK-safe order
await sql`ALTER TABLE certificates DISABLE TRIGGER trg_certificates_immutable`.execute(db);
await db.deleteFrom("certificates").execute();
await sql`ALTER TABLE certificates ENABLE TRIGGER trg_certificates_immutable`.execute(db);
await db.deleteFrom("quiz_attempts").execute(); // cascades assessment_focus_events
await db.deleteFrom("lesson_progress").execute();
await db.deleteFrom("learning_sessions").execute();
await db.deleteFrom("video_reports").execute();
await db.deleteFrom("course_assignment_recipients").execute();
await db.deleteFrom("course_assignments").execute();
await db.deleteFrom("cohort_registrations").execute();
await db.deleteFrom("cohort_watches").execute();
await db.deleteFrom("program_cohorts").execute();
await db.deleteFrom("announcements").execute();
await db.deleteFrom("program_courses").execute();
await db.deleteFrom("programs").execute();
await db.deleteFrom("enrollments").execute();
await db.deleteFrom("quiz_questions").execute();
await db.deleteFrom("lessons").execute();
await db.deleteFrom("courses").execute();

// 2. The instructor (reassign later from the admin UI if needed)
const instructor = await db.selectFrom("users").select(["id"]).where("email", "=", "instructor@upskill.test").executeTakeFirstOrThrow();

// 3. Create the course
const course = await db
  .insertInto("courses")
  .values({
    instructor_id: instructor.id,
    title: "การประดิษฐ์กระทงรักษ์โลกและจริยธรรมสิ่งแวดล้อม",
    slug: "krathong-rak-lok",
    description:
      "ศึกษาและปฏิบัติการประดิษฐ์กระทงจากวัสดุธรรมชาติ 100% ไร้โลหะและสารพิษ ตั้งแต่พื้นฐานงานใบตอง การพับ-เย็บกลีบ การประกอบโครงสร้างกระทงระดับอาชีวศึกษา เทคนิคกลีบประดับและวัสดุทดแทนโลหะ ตลอดจนจริยธรรมสิ่งแวดล้อม ผลกระทบต่อระบบนิเวศแหล่งน้ำ และวิถีลอยกระทงอย่างยั่งยืน 10 บทเรียนวิดีโอ พร้อมคำถามระหว่างเรียนและแบบทดสอบท้ายหลักสูตร",
    visibility: "draft",
    total_duration_sec: 7948,
    credential_enabled: true,
    credential_type: "completion",
    credential_name_th: "วุฒิบัตร",
    credential_template_key: "standard",
    credential_signer_name: null,
    credential_signer_title: "วิทยากรหลักสูตรการประดิษฐ์กระทงรักษ์โลก",
    credential_achievement_th: "ผ่านการอบรมการประดิษฐ์กระทงรักษ์โลกและจริยธรรมสิ่งแวดล้อมตามเกณฑ์",
  })
  .returning(["id"])
  .executeTakeFirstOrThrow();

// 4. The 10 lessons (YouTube IDs and durations from the course document)
const lessons = [
  { order: 1, title: "การทำกระทงใบตอง 8 รูปแบบ (อาชีวะเพชรบุรี Ep.18)", yt: "Jz7hf2llxn8", dur: 1136 },
  { order: 2, title: "การทำถาดใบตองกลีบเล็บครุฑ (อาชีวะเพชรบุรี Ep.16)", yt: "InSTfu_L0BE", dur: 545 },
  { order: 3, title: "ถาดใบตองกลีบเล็บครุฑระดับ ปวส.2 (Adisuk Maneepong)", yt: "R-qIcJRQ6Vk", dur: 792 },
  { order: 4, title: "การพับกลีบคอเสื้อตกแต่งกระทง (Khru Ni ครูนิ)", yt: "a9HHMNE7gg0", dur: 412 },
  { order: 5, title: "กระทงใบตองและมะละกอวัสดุธรรมชาติ 100% (DIY by มนต์ตาล)", yt: "08SqdqqS8GQ", dur: 535 },
  { order: 6, title: "กระทงจากต้นกล้วยไร้โลหะ Ep.917 (kaew787 แก้ว)", yt: "SfV9aLtB7QM", dur: 275 },
  { order: 7, title: "ความจริงเรื่องกระทงขนมปังกับแหล่งน้ำ (ข่าวช่องวัน)", yt: "hVRKZrtsURs", dur: 217 },
  { order: 8, title: "กระแสตื่นตัวและแนวทางลอยกระทงรักษ์โลก (Thai PBS)", yt: "BxZXgUF1CT8", dur: 526 },
  { order: 9, title: "ลอยกระทง ไม่หลงทาง: รู้สู้ภัย Don't Panic (Thai PBS)", yt: "kH0YiIh9VEw", dur: 1705 },
  { order: 10, title: "ลอยกระทงวิถีใหม่ สู่โลกสีเขียว (Thai PBS & TEI)", yt: "g_H2Zoh0tlM", dur: 1805 },
] as const;

for (const l of lessons) {
  await db
    .insertInto("lessons")
    .values({ course_id: course.id, sequence_order: l.order, title: l.title, youtube_video_id: l.yt, duration_sec: l.dur, video_status: "active" })
    .execute();
}
const lessonRows = await db.selectFrom("lessons").select(["id", "sequence_order"]).where("course_id", "=", course.id).orderBy("sequence_order").execute();

// 5. In-video checkpoint per lesson (the 10 "ระหว่างชม" questions)
const checkpoints = [
  {
    q: "เมื่อซ้อนใบตองวงกลม 2 แผ่นเพื่อเตรียมพับกระทง ควรวางแนวเส้นใบตองอย่างไรจึงจะแข็งแรงไม่ฉีกแตกง่าย?",
    opts: ["วางแนวเส้นใบตองไปในทิศทางเดียวกันทั้ง 2 แผ่น", "วางแนวเส้นใบตองสลับกันระหว่างแนวตั้งและแนวนอน", "วางด้านหลังใบตองประกบเข้าหากันโดยหันด้านมันออกทั้งหมด", "ใช้ใบตองแผ่นเดียวที่มีความหนามากที่สุดแทนการซ้อน"],
    correct: 1, at: 35,
  },
  {
    q: "ตามมาตรฐานงานคหกรรมศาสตร์ ควรเลือกใช้เข็มและด้ายขนาดใดในการเย็บถาดใบตองกลีบเล็บครุฑ?",
    opts: ["เข็มเย็บกระสอบและเชือกฟาง", "เข็มหมุดหัวมุกและด้ายเอ็นใส", "เข็มสอยเบอร์ 7 และด้ายเบอร์ 60 สีเขียวขี้ม้าหรือสีดำ", "เข็มปักครอสติชและไหมพรม"],
    correct: 2, at: 75,
  },
  {
    q: "ระหว่างเย็บหรือพักชิ้นงาน ควรดูแลใบตองอย่างไรไม่ให้แห้งเหี่ยวหรือกรอบแตก?",
    opts: ["นำไปผึ่งลมใต้พัดลมให้แห้งสนิท", "พรมน้ำด้วยฟ็อกกี้เป็นระยะ และใช้ผ้าขาวบางชุบน้ำหมาดห่อเก็บความชื้น", "ทาน้ำมันพืชบาง ๆ บนผิวใบตองทุกชิ้น", "นำไปแช่ในน้ำเดือดก่อนเย็บ"],
    correct: 1, at: 370,
  },
  {
    q: "ขั้นตอนใดสำคัญที่สุดในการทำให้กลีบคอเสื้อมีรูปทรงสมมาตรเท่ากันทั้งซ้ายและขวา?",
    opts: ["การกะระยะด้วยสายตาโดยไม่ต้องพับแบ่งส่วน", "การพับทบแบ่งครึ่งกึ่งกลางให้ชัดเจนก่อนพับมุมทั้งสองฝั่งเข้าหาแกนกลาง", "การตัดปลายใบตองออกทั้งหมดก่อนพับ", "การใช้ใบตอง 2 สีที่ความหนาต่างกัน"],
    correct: 1, at: 60,
  },
  {
    q: "การนำส่วนประกอบของมะละกอมาใช้ร่วมกับใบตองในการทำกระทงมีข้อดีด้านใดมากที่สุด?",
    opts: ["เพิ่มสีสัน ลวดลาย และรูปทรงแปลกใหม่จากธรรมชาติ 100% แทนริบบิ้นหรือดอกไม้พลาสติก", "ทำให้กระทงมีน้ำหนักมากขึ้นจนจมลงก้นแม่น้ำทันที", "ทำให้สามารถใช้แทนเทียนไขได้", "ช่วยป้องกันไม่ให้ใบตองเปียกน้ำ"],
    correct: 0, at: 120,
  },
  {
    q: "เมื่อหั่นก้านกล้วยเฉียงเป็นกลีบแล้ว เหตุใดจึงต้องนำไปแช่น้ำก่อนนำมาเสียบประกอบบนฐาน?",
    opts: ["เพื่อให้ก้านกล้วยพองตัวใหญ่ขึ้น", "เพื่อให้ยางกล้วยออกให้หมด ป้องกันการระคายเคืองมือและไม่ให้กลีบดำคล้ำเร็ว", "เพื่อให้ก้านกล้วยเปลี่ยนเป็นสีม่วง", "เพื่อล้างสารกันบูดออกจากก้านกล้วย"],
    correct: 1, at: 24,
  },
  {
    q: "เหตุใดกระทงขนมปังที่ย่อยสลายได้ภายใน 3 วันจึงยังทำให้ปลาตายและน้ำเน่าเสียได้?",
    opts: ["ปลาไทยส่วนใหญ่ไม่กินขนมปัง เมื่อขนมปังเปื่อยยุ่ยจมน้ำ จุลินทรีย์ย่อยแป้งและดึงออกซิเจนออกจนเกิดภาวะพร่องออกซิเจน", "ขนมปังทำให้น้ำในแม่น้ำกลายเป็นน้ำแข็ง", "ขนมปังลอยตัวเร็วเกินไปจนเจ้าหน้าที่เก็บไม่ทัน", "ขนมปังมีสารพิษที่ฆ่าปลาทันทีที่สัมผัสน้ำ"],
    correct: 0, at: 100,
  },
  {
    q: "ปัจจัยสำคัญที่ทำให้การรณรงค์ลอยกระทงรักษ์โลกประสบความสำเร็จอย่างยั่งยืนคือข้อใด?",
    opts: ["การออกกฎหมายห้ามจัดงานลอยกระทงทั่วประเทศ", "ความร่วมมือและการตระหนักรู้ร่วมกันทั้งผู้ประดิษฐ์ ผู้จัดงาน และประชาชนในการลดปริมาณและคัดเลือกวัสดุ", "การเพิ่มจำนวนกระทงให้มากขึ้นทุกปีเพื่อกระตุ้นเศรษฐกิจ", "การใช้เฉพาะกระทงกระดาษสีสะท้อนแสง"],
    correct: 1, at: 120,
  },
  {
    q: "ทฤษฎี \"ประเพณีประดิษฐ์\" (Invented Tradition) อธิบายการปรับเปลี่ยนรูปแบบลอยกระทงอย่างไร?",
    opts: ["ประเพณีเป็นสิ่งที่สังคมสร้างและปรับปรุงให้สอดคล้องกับยุคสมัยได้ จึงปรับวิธีลอยให้รักษ์โลกได้โดยยังคงแก่นการขอขมาสายน้ำ", "ประเพณีโบราณห้ามปรับเปลี่ยนรูปแบบหรือวัสดุโดยเด็ดขาด", "ประเพณีลอยกระทงเป็นเรื่องสมมติที่ไม่มีคุณค่าทางวัฒนธรรม", "ควรยกเลิกประเพณีทุกชนิดที่มีการใช้น้ำ"],
    correct: 0, at: 450,
  },
  {
    q: "เมื่อกระทงโฟมและพลาสติกแตกตัวในแหล่งน้ำ จะก่อให้เกิดภัยเงียบใดที่ส่งผลกระทบย้อนกลับมาสู่มนุษย์?",
    opts: ["เกิดไมโครพลาสติกที่แทรกซึมเข้าสู่ห่วงโซ่อาหารในสัตว์น้ำและย้อนกลับเข้าสู่ร่างกายมนุษย์", "ทำให้น้ำในแม่น้ำระเหยเร็วขึ้น", "ทำให้ค่าออกซิเจนในน้ำสูงเกินไป", "ทำให้ปลาเจริญเติบโตเร็วผิดปกติ"],
    correct: 0, at: 85,
  },
] as const;

for (const [i, cp] of checkpoints.entries()) {
  await db
    .updateTable("lessons")
    .set({
      checkpoint_question: cp.q,
      checkpoint_options: JSON.stringify(cp.opts),
      checkpoint_correct_index: cp.correct,
      checkpoint_at_sec: cp.at,
    })
    .where("id", "=", lessonRows[i]!.id)
    .execute();
}

// 6. Post-test (the 10 "หลังดูคลิป" questions; publish rule needs >= 3)
const postQuestions = [
  {
    q: "เหตุใดในคลิปจึงเตือนเรื่องการใช้ไม้กลัดกับกระทงขนม/อาหารบางชนิด และหลักคิดนี้เชื่อมโยงกับกระทงรักษ์โลกอย่างไร?",
    opts: ["ไม้กลัดทำให้ขนมเสียรสชาติ ส่วนกระทงรักษ์โลกทำให้ใบตองเหี่ยว", "ไม้กลัดอาจหลุดทิ่มคอผู้บริโภคได้หากใช้กับอาหาร ส่วนกระทงลอยน้ำห้ามใช้เข็มหมุด/แม็กเพราะจะบาดมือคนเก็บและเป็นอันตรายต่อสัตว์น้ำ", "ไม้กลัดมีราคาแพงกว่าลวดเย็บกระดาษ", "ไม้กลัดไม่สามารถยึดมุมใบตองได้แน่นเท่าเทปกาว"],
    correct: 1,
  },
  {
    q: "การเย็บกลีบด้วยวิธี \"ด้นถอยหลัง\" และย้ำ 2 รอบที่จุดเริ่มต้น-จุดสิ้นสุด มีความสำคัญต่อโครงสร้างกระทงหรือถาดใบตองอย่างไร?",
    opts: ["ทำให้โครงสร้างกลีบยึดติดแน่น ไม่หลุดลุ่ยเมื่อถูกน้ำหรือขณะปักกลีบชั้นที่ 2 สับหว่าง", "ทำให้ใบตองเปลี่ยนสีเป็นสีเขียวสด", "ช่วยลดเวลาการพับกลีบลงครึ่งหนึ่ง", "ใช้แทนการติดเปียตะขาบได้โดยไม่ต้องเก็บขอบ"],
    correct: 0,
  },
  {
    q: "การเย็บเนาเก็บความเรียบร้อยรอบขอบถาดก่อนติดตัวตะขาบ ควรกำหนดขนาดฝีเข็มอย่างไร?",
    opts: ["เย็บฝีเข็มยาวห่างกัน 3 นิ้ว", "เย็บฝีเข็มเล็ก ๆ ขนาดเท่าเมล็ดถั่วเขียวเป็นช่วง ๆ", "ใช้ลวดเย็บกระดาษเย็บถี่ ๆ แทนด้าย", "ไม่ต้องเย็บ ให้วางตัวตะขาบพาดไว้เฉย ๆ"],
    correct: 1,
  },
  {
    q: "เมื่อนำกลีบคอเสื้อที่พับเสร็จแล้วไปติดประดับบนฐานกระทงรักษ์โลก ควรใช้วิธีใดยึดกลีบจึงจะปลอดภัยต่อสิ่งแวดล้อมมากที่สุด?",
    opts: ["ใช้เข็มหมุดหัวมุกปักยึด", "ใช้ปืนกาวร้อนยึดรอบฐาน", "ใช้ไม้กลัดเหลาหรือเย็บเนาด้วยด้ายฝ้ายธรรมชาติ", "ใช้เทปกาวสองหน้าพันรอบฐาน"],
    correct: 2,
  },
  {
    q: "หากผู้เรียนนำผักหรือผลไม้สดจากสวนมาประดิษฐ์กระทง ควรหลีกเลี่ยงการกระทำใดมากที่สุด?",
    opts: ["การล้างทำความสะอาดก่อนนำมาใช้", "การใช้ไม้กลัดยึดชิ้นส่วน", "การพ่นสีสเปรย์เคมีหรือแล็กเกอร์เคลือบเงาทับลงบนผิววัสดุ", "การตกแต่งร่วมกับดอกไม้สดตามฤดูกาล"],
    correct: 2,
  },
  {
    q: "วัสดุใดในคลิปที่นำมาใช้เสียบกลีบแทนตะปู และเมื่อเก็บกระทงขึ้นจากน้ำแล้วสามารถนำไปจัดการต่ออย่างไร?",
    opts: ["ลวดทองแดง และนำไปเผาทำลาย", "ทางมะพร้าวแห้ง และนำไปหมักทำเป็นปุ๋ยอินทรีย์ได้ทันที", "ไม้จิ้มฟันพลาสติก และนำไปฝังกลบ", "เข็มหมุดสเตนเลส และนำไปล้างใช้ซ้ำ"],
    correct: 1,
  },
  {
    q: "การลอยกระทงขนมปังในแม่น้ำสายหลักที่มีกระแสน้ำไหลแรงก่อให้เกิดความเสี่ยงต่อเนื่องอย่างไร?",
    opts: ["ทำให้กระแสน้ำไหลช้าลง", "เจ้าหน้าที่จัดเก็บได้ยากเพราะเปื่อยยุ่ย และอาจถูกพัดออกสู่ชายทะเลกลายเป็นขยะพิษต่อสัตว์ทะเล", "ช่วยเพิ่มแร่ธาตุให้ปะการัง", "ทำให้ปลาทะเลว่ายทวนน้ำเข้ามาในแม่น้ำ"],
    correct: 1,
  },
  {
    q: "การเลือกใช้วัสดุที่ย่อยสลายได้ง่ายและจัดเก็บสะดวกของภาคประชาชน ช่วยลดภาระขององค์กรปกครองส่วนท้องถิ่นในด้านใด?",
    opts: ["ลดงบประมาณ แรงงาน และเวลาในการคัดแยกขยะและฟื้นฟูแหล่งน้ำหลังเทศกาล", "ทำให้ไม่ต้องมีเจ้าหน้าที่ดูแลความปลอดภัยทางน้ำ", "ช่วยลดจำนวนผู้เข้าร่วมงาน", "ทำให้ไม่ต้องจัดเตรียมสถานที่ลอยกระทง"],
    correct: 0,
  },
  {
    q: "ข้อสรุปแนวทางลอยกระทงลดมลพิษ 5 ประการจากรายการ ข้อใดกล่าวถูกต้องครบถ้วนที่สุด?",
    opts: ["ลอยคนละ 2 ใบ ใช้ขนมปังและกระดาษแข็ง", "ไปด้วยกันกระทงเดียวกัน (1 ครอบครัว/คู่รัก 1 ใบ), ใช้หยวกกล้วย/ใบตอง, เลี่ยงแป้งและขนมปัง, เลี่ยงกระดาษ และงดลวด แม็ก หมุดโลหะ ตะปู พลาสติก โฟม", "ลอยกระทงโฟมในแม่น้ำสายหลักเท่านั้น", "ใช้ตะปูยึดใบตองเพื่อให้เก็บกู้ได้ง่ายขึ้น"],
    correct: 1,
  },
  {
    q: "เหตุใดแม้แต่กระทงใบตองก็ยังต้องจำกัดปริมาณและลอยในพื้นที่ที่มีการจัดเก็บ?",
    opts: ["เพราะใบตองไม่ลอยน้ำในเวลากลางคืน", "เพราะหากลอยจำนวนมากพร้อมกันในแหล่งน้ำที่ไม่มีการจัดเก็บ จะเกิดการสะสมเป็นมวลขยะขนาดใหญ่และกระทบต่อระบบนิเวศได้เช่นกัน", "เพราะใบตองย่อยสลายช้ากว่าโฟม", "เพราะใบตองไม่สามารถนำไปทำปุ๋ยหมักได้"],
    correct: 1,
  },
] as const;

for (const q of postQuestions) {
  await db
    .insertInto("quiz_questions")
    .values({
      course_id: course.id,
      question_text: q.q,
      options: JSON.stringify(q.opts.map((text, i) => ({ id: String.fromCharCode(97 + i), text }))),
      correct_option_id: String.fromCharCode(97 + q.correct),
      assessment_type: "post",
      is_active: true,
    })
    .execute();
}

// 7. Publish the course
await db.updateTable("courses").set({ visibility: "published", published_at: new Date() }).where("id", "=", course.id).execute();

console.log(`✓ seeded course ${course.id} with ${lessons.length} lessons, ${checkpoints.length} checkpoints, ${postQuestions.length} post questions`);
await db.destroy();
