// Dev seed: three users (admin / instructor / learner) + one published demo course.
// Refuses to run in production. Re-running is safe (skips existing rows).
import { createDb } from "@upskill/db";
import { getEnv } from "@upskill/infra/env";
import { PDPA_NOTICE_VERSION } from "@upskill/core";
import { hashPassword } from "@upskill/infra/password";
import { encryptSettingSecret, nationalIdDigest } from "@upskill/infra/secret-box";
import { fetchVideos } from "@upskill/infra/youtube-client";

const env = getEnv();
if (env.APP_ENV === "production") throw new Error("seed must not run in production");

const db = createDb(env.DATABASE_URL);
const PASSWORD = "upskill-dev-password";

// Big Buck Bunny (Blender Foundation, CC BY 3.0): public and embeddable
const DEMO_VIDEO = { id: "aqz-KE-bpKQ", fallbackDurationSec: 634, title: "Big Buck Bunny" };

async function upsertUser(email: string, role: "admin" | "instructor" | "member", nameTh: string, nameEn: string) {
  const existing = await db.selectFrom("users").select("id").where("email", "=", email).executeTakeFirst();
  if (existing) return existing.id;
  const u = await db
    .insertInto("users")
    .values({
      email,
      role,
      email_verified_at: new Date(),
      password_hash: await hashPassword(PASSWORD),
      password_updated_at: new Date(),
      legal_full_name_th: nameTh,
      legal_full_name_en: nameEn,
      // Leave the learner unlocked so the "confirm your legal name" flow can be tried
      legal_name_locked_at: role === "member" ? null : new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return u.id;
}

await upsertUser("admin@upskill.test", "admin", "ผู้ดูแล ระบบ", "System Admin");
const instructorId = await upsertUser("instructor@upskill.test", "instructor", "ครูสมศรี ใจดี", "Somsri Jaidee");
const learnerId = await upsertUser("learner@upskill.test", "member", "นายสมชาย เรียนดี", "Mr. Somchai Riandee");

/** Test national ID: fixed first 12 digits + the real check digit (not a real person's number) */
function testNationalId(first12: string) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return first12 + String((11 - (sum % 11)) % 10);
}

// The demo learner gets a complete profile so enrollment works out of the box
if (!(await db.selectFrom("user_profiles").select("user_id").where("user_id", "=", learnerId).executeTakeFirst())) {
  const nationalId = testNationalId("199990000001");
  await db
    .insertInto("user_profiles")
    .values({
      user_id: learnerId,
      title_th: "นาย", first_name_th: "สมชาย", last_name_th: "เรียนดี",
      title_en: "Mr.", first_name_en: "Somchai", last_name_en: "Riandee",
      phone: "0812345678", birth_date: "1995-01-15",
      address_line: "99 หมู่ 1", subdistrict: "ในเมือง", district: "เมืองร้อยเอ็ด", province: "ร้อยเอ็ด", postal_code: "45000",
      national_id_hmac: nationalIdDigest(nationalId, env.SETTINGS_ENCRYPTION_KEY),
      national_id_encrypted: encryptSettingSecret(nationalId, env.SETTINGS_ENCRYPTION_KEY),
      national_id_last4: nationalId.slice(-4),
      pdpa_notice_version: PDPA_NOTICE_VERSION,
      pdpa_consented_at: new Date(),
    })
    .execute();
}

let durationSec = DEMO_VIDEO.fallbackDurationSec;
if (env.YOUTUBE_API_KEY) {
  const r = (await fetchVideos(env.YOUTUBE_API_KEY, [DEMO_VIDEO.id])).get(DEMO_VIDEO.id);
  if (r?.ok) durationSec = r.durationSec;
} else {
  console.warn(`YOUTUBE_API_KEY not set: using fallback duration ${durationSec}s for the demo video`);
}

const slug = "demo-big-buck-bunny";
if (!(await db.selectFrom("courses").select("id").where("slug", "=", slug).executeTakeFirst())) {
  await db.transaction().execute(async (trx) => {
    const c = await trx
      .insertInto("courses")
      .values({
        instructor_id: instructorId,
        title: "หลักสูตรตัวอย่าง: การเล่าเรื่องด้วยแอนิเมชัน",
        slug,
        description: "หลักสูตรตัวอย่างสำหรับทดสอบ Pre-test การเรียนวิดีโอ แบบทดสอบระหว่างอบรม และ Post-test ก่อนรับใบรับรอง",
        visibility: "published",
        published_at: new Date(),
        is_verified_course: true,
        total_duration_sec: durationSec,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const lesson = await trx
      .insertInto("lessons")
      .values({ course_id: c.id, sequence_order: 1, title: DEMO_VIDEO.title, youtube_video_id: DEMO_VIDEO.id, duration_sec: durationSec })
      .returning("id")
      .executeTakeFirstOrThrow();
    const q = (text: string, options: string[], correct: number, assessmentType: "pre" | "lesson" | "post" = "post") => ({
      course_id: c.id,
      assessment_type: assessmentType,
      lesson_id: assessmentType === "lesson" ? lesson.id : null,
      question_text: text,
      options: JSON.stringify(options.map((t, i) => ({ id: String.fromCharCode(97 + i), text: t }))),
      correct_option_id: String.fromCharCode(97 + correct),
    });
    await trx
      .insertInto("quiz_questions")
      .values([
        q("ก่อนเรียน คุณเคยรับชมสื่อแอนิเมชันเพื่อวิเคราะห์การเล่าเรื่องหรือไม่", ["เคย", "ไม่เคย"], 0, "pre"),
        q("หลังดูบทเรียน ตัวละครหลักของเรื่องเป็นสัตว์ชนิดใด", ["กระต่าย", "สุนัข", "แมว", "หมี"], 0, "lesson"),
        q("ตัวละครหลักของเรื่องเป็นสัตว์ชนิดใด", ["กระต่าย", "สุนัข", "แมว", "หมี"], 0),
        q("แอนิเมชันเรื่องนี้สร้างโดยใคร", ["Pixar", "Blender Foundation", "Studio Ghibli", "DreamWorks"], 1),
        q("ระบบนับเวลาเรียนจากสิ่งใด", ["นาฬิกาของเครื่องผู้เรียน", "เวลาจริงฝั่งเซิร์ฟเวอร์", "จำนวนครั้งที่กดเล่น", "ไม่ได้นับ"], 1),
      ])
      .execute();
  });
}

console.log(`Seeded. Log in with any of admin@ / instructor@ / learner@upskill.test, password: ${PASSWORD}`);
await db.destroy();
