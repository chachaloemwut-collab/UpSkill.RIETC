import { createDb, sql } from "@upskill/db";
import { getEnv } from "@upskill/infra/env";
import {
  computeVisualDigest,
  generateCertificateCode,
  normalizeName,
  signCertificate,
  type CertificatePayload,
} from "@upskill/core";
import { hashPassword } from "@upskill/infra/password";

const env = getEnv();
// Creates demo accounts with a password that is public in this repository: never on a real system
if (env.APP_ENV === "production") throw new Error("complete-krathong-flow is a development seed and must not run in production");
const db = createDb(env.DATABASE_URL);
const PASSWORD = "upskill-dev-password"; // secrets-check: allow (local demo accounts; the script refuses production)

async function main() {
  console.log("=== Completing Krathong Course & Certificate End-to-End Flow ===");

  // 1. Find the Krathong course
  const course = await db
    .selectFrom("courses")
    .selectAll()
    .where("slug", "=", "krathong-rak-lok")
    .executeTakeFirst();

  if (!course) {
    throw new Error("Course krathong-rak-lok not found in database!");
  }
  console.log(`✓ Found course: ${course.title} (ID: ${course.id})`);

  // 2. Upgrade course certificate & institutional settings
  await db
    .updateTable("courses")
    .set({
      credential_enabled: true,
      credential_type: "completion",
      credential_name_th: "ใบประกาศนียบัตรสำเร็จการศึกษา",
      credential_name_en: "Certificate of Course Completion",
      credential_template_key: "classic",
      credential_text_align: "center",
      credential_signer_name: "ศ.ดร. มานะ อิ่มเอิบ",
      credential_signer_title: "ผู้อำนวยการสถาบันการอาชีวศึกษาภาคตะวันออก",
      credential_achievement_th:
        "ได้สำเร็จการศึกษาตามเกณฑ์มาตรฐานในหลักสูตร การประดิษฐ์กระทงรักษ์โลกและจริยธรรมสิ่งแวดล้อม",
      credential_achievement_en:
        "Has successfully completed all academic requirements in Eco-friendly Krathong Crafting and Environmental Ethics",
      min_watch_percentage: 90,
      passing_quiz_score: 80,
      visibility: "published",
    })
    .where("id", "=", course.id)
    .execute();
  console.log("✓ Updated course credential metadata with official RIETC signatures");

  // 3. Ensure primary learner (learner@upskill.test)
  let learner = await db
    .selectFrom("users")
    .selectAll()
    .where("email", "=", "learner@upskill.test")
    .executeTakeFirst();

  if (!learner) {
    const u = await db
      .insertInto("users")
      .values({
        email: "learner@upskill.test",
        role: "member",
        email_verified_at: new Date(),
        password_hash: await hashPassword(PASSWORD),
        password_updated_at: new Date(),
        legal_full_name_th: "นายสมชาย เรียนดี",
        legal_full_name_en: "Mr. Somchai Riandee",
        legal_name_locked_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    learner = u;
  } else {
    if (learner.legal_name_locked_at) {
      if (learner.role !== "member") {
        await db.updateTable("users").set({ role: "member" }).where("id", "=", learner.id).execute();
      }
    } else {
      await db
        .updateTable("users")
        .set({
          role: "member",
          legal_full_name_th: learner.legal_full_name_th || "นายสมชาย เรียนดี",
          legal_full_name_en: learner.legal_full_name_en || "Mr. Somchai Riandee",
          legal_name_locked_at: new Date(),
        })
        .where("id", "=", learner.id)
        .execute();
      learner.legal_name_locked_at = new Date();
    }
  }
  console.log(`✓ Learner profile ready & legal name locked: ${learner.email}`);

  // 4. Ensure enrollment in Krathong course
  let enrollment = await db
    .selectFrom("enrollments")
    .selectAll()
    .where("user_id", "=", learner.id)
    .where("course_id", "=", course.id)
    .executeTakeFirst();

  if (!enrollment) {
    const e = await db
      .insertInto("enrollments")
      .values({
        user_id: learner.id,
        course_id: course.id,
        status: "completed",
        enrolled_at: new Date(Date.now() - 7 * 86400000),
        completed_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    enrollment = e;
  } else {
    await db
      .updateTable("enrollments")
      .set({
        status: "completed",
        completed_at: new Date(),
      })
      .where("id", "=", enrollment.id)
      .execute();
  }
  console.log(`✓ Enrollment marked as completed (Enrollment ID: ${enrollment.id})`);

  // 5. Populate lesson_progress for all 10 lessons
  const lessons = await db
    .selectFrom("lessons")
    .selectAll()
    .where("course_id", "=", course.id)
    .orderBy("sequence_order", "asc")
    .execute();

  console.log(`✓ Found ${lessons.length} lessons in course`);

  for (const l of lessons) {
    const existing = await db
      .selectFrom("lesson_progress")
      .select("id")
      .where("enrollment_id", "=", enrollment.id)
      .where("lesson_id", "=", l.id)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable("lesson_progress")
        .set({
          is_completed: true,
          accumulated_valid_sec: l.duration_sec,
          max_watched_sec: l.duration_sec,
          watched_chunks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
          total_chunks_required: 10,
          last_position_sec: l.duration_sec,
        })
        .where("id", "=", existing.id)
        .execute();
    } else {
      await db
        .insertInto("lesson_progress")
        .values({
          enrollment_id: enrollment.id,
          lesson_id: l.id,
          is_completed: true,
          accumulated_valid_sec: l.duration_sec,
          max_watched_sec: l.duration_sec,
          watched_chunks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
          total_chunks_required: 10,
          last_position_sec: l.duration_sec,
        })
        .execute();
    }
  }
  console.log("✓ Progress recorded: 10/10 lessons watched 100%");

  // 6. Record a passed Post-test attempt in quiz_attempts
  const postQuestions = await db
    .selectFrom("quiz_questions")
    .selectAll()
    .where("course_id", "=", course.id)
    .where("assessment_type", "=", "post")
    .execute();

  const snapshot = postQuestions.map((q) => {
    let opts = [];
    try {
      opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
    } catch {
      opts = [];
    }
    return {
      id: q.id,
      text: q.question_text,
      options: opts,
      correctOptionId: q.correct_option_id,
    };
  });

  const answers = postQuestions.map((q) => ({
    questionId: q.id,
    optionId: q.correct_option_id,
  }));

  const existingAttempt = await db
    .selectFrom("quiz_attempts")
    .select("id")
    .where("enrollment_id", "=", enrollment.id)
    .where("assessment_type", "=", "post")
    .where("is_passed", "=", true)
    .executeTakeFirst();

  if (!existingAttempt) {
    await db
      .insertInto("quiz_attempts")
      .values({
        enrollment_id: enrollment.id,
        assessment_type: "post",
        questions_snapshot: JSON.stringify(snapshot),
        user_answers: JSON.stringify(answers),
        score_percentage: "100.00",
        is_passed: true,
        started_at: new Date(Date.now() - 3600000),
        submitted_at: new Date(Date.now() - 1800000),
        expires_at: new Date(Date.now() + 3600000),
      })
      .execute();
    console.log("✓ Recorded passed Post-test attempt: 100% score");
  } else {
    console.log("✓ Passed Post-test attempt already exists");
  }

  // 7. Check if Certificate already exists or generate signed certificate
  const existingCert = await db
    .selectFrom("certificates")
    .selectAll()
    .where("enrollment_id", "=", enrollment.id)
    .executeTakeFirst();

  let certCode = existingCert?.certificate_code;

  if (!existingCert) {
    const issuedAt = new Date();
    certCode = generateCertificateCode(issuedAt.getUTCFullYear());
    const recipientName = normalizeName(learner.legal_full_name_th || "นายสมชาย เรียนดี");
    const courseTitle = normalizeName(course.title);
    const visualDigest = computeVisualDigest(recipientName, courseTitle, certCode);

    const payload: CertificatePayload = {
      v: 3,
      code: certCode,
      enrollmentId: enrollment.id,
      userId: learner.id,
      courseId: course.id,
      recipientName,
      courseTitle,
      instructorName: normalizeName("ศ.ดร. มานะ อิ่มเอิบ"),
      totalStudySec: 7948,
      quizScore: "100.00",
      verifiedCourse: true,
      issuedAt: issuedAt.toISOString(),
      documentName: normalizeName("ใบประกาศนียบัตรสำเร็จการศึกษา"),
      documentType: "completion",
      expiresAt: null,
      signerTitle: "ผู้อำนวยการสถาบันการอาชีวศึกษาภาคตะวันออก",
      achievement: normalizeName(
        "ได้สำเร็จการศึกษาตามเกณฑ์มาตรฐานในหลักสูตร การประดิษฐ์กระทงรักษ์โลกและจริยธรรมสิ่งแวดล้อม",
      ),
      visualDigest,
    };

    const signed = signCertificate(
      payload,
      env.CERT_SIGNING_ACTIVE_KID,
      env.CERT_SIGNING_PRIVATE_KEY,
    );

    await db
      .insertInto("certificates")
      .values({
        certificate_code: certCode,
        enrollment_id: enrollment.id,
        user_id: learner.id,
        course_id: course.id,
        recipient_name_snapshot: payload.recipientName,
        course_title_snapshot: payload.courseTitle,
        instructor_name_snapshot: payload.instructorName,
        total_actual_study_sec: payload.totalStudySec,
        quiz_score_snapshot: payload.quizScore,
        is_verified_course_snapshot: payload.verifiedCourse,
        signed_payload: signed.signedPayload,
        signature: signed.signature,
        signing_key_id: signed.keyId,
        issued_at: issuedAt,
        payload_version: 3,
        document_name_snapshot: payload.documentName,
        document_type_snapshot: payload.documentType,
        expires_at: null,
        signer_title_snapshot: payload.signerTitle,
        achievement_snapshot: payload.achievement,
        visual_digest: payload.visualDigest,
        template_snapshot: "classic",
        background_url_snapshot: null,
        text_align_snapshot: "center",
      })
      .execute();

    console.log(`✓ Cryptographic Certificate Issued! Code: ${certCode}`);
  } else {
    console.log(`✓ Certificate already exists: ${certCode}`);
  }

  // 8. Add 2 more realistic enrolled learners for realistic multi-user demonstration
  console.log("\n--- Adding Realistic Additional Learners for Krathong Course ---");

  // Learner 2: Kanya (In Progress, 6/10 lessons)
  const kanyaEmail = "kanya.p@upskill.test";
  let kanya = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", kanyaEmail)
    .executeTakeFirst();
  if (!kanya) {
    kanya = await db
      .insertInto("users")
      .values({
        email: kanyaEmail,
        role: "member",
        email_verified_at: new Date(),
        password_hash: await hashPassword(PASSWORD),
        password_updated_at: new Date(),
        legal_full_name_th: "นางสาวกัญญา พงษ์ศิริ",
        legal_full_name_en: "Ms. Kanya Pongsiri",
        legal_name_locked_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
  }

  const kanyaEnrollment = await db
    .selectFrom("enrollments")
    .select("id")
    .where("user_id", "=", kanya.id)
    .where("course_id", "=", course.id)
    .executeTakeFirst();

  let kanyaEnrollmentId = kanyaEnrollment?.id;
  if (!kanyaEnrollment) {
    const e = await db
      .insertInto("enrollments")
      .values({
        user_id: kanya.id,
        course_id: course.id,
        status: "in_progress",
        enrolled_at: new Date(Date.now() - 3 * 86400000),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    kanyaEnrollmentId = e.id;
  }

  // First 6 lessons completed for Kanya
  for (let i = 0; i < 6; i++) {
    const l = lessons[i]!;
    await db
      .insertInto("lesson_progress")
      .values({
        enrollment_id: kanyaEnrollmentId!,
        lesson_id: l.id,
        is_completed: true,
        accumulated_valid_sec: l.duration_sec,
        max_watched_sec: l.duration_sec,
        watched_chunks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        total_chunks_required: 10,
        last_position_sec: l.duration_sec,
      })
      .onConflict((oc) =>
        oc.columns(["enrollment_id", "lesson_id"]).doUpdateSet({
          is_completed: true,
          accumulated_valid_sec: l.duration_sec,
        }),
      )
      .execute();
  }
  console.log("✓ Learner 2: นางสาวกัญญา พงษ์ศิริ (กำลังเรียน 6/10 บท)");

  // Learner 3: Thanakorn (Locked 3 attempts in 24h, for testing Unlock action)
  const thanakornEmail = "thanakorn.s@upskill.test";
  let thanakorn = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", thanakornEmail)
    .executeTakeFirst();
  if (!thanakorn) {
    thanakorn = await db
      .insertInto("users")
      .values({
        email: thanakornEmail,
        role: "member",
        email_verified_at: new Date(),
        password_hash: await hashPassword(PASSWORD),
        password_updated_at: new Date(),
        legal_full_name_th: "นายธนากร สุขเกษม",
        legal_full_name_en: "Mr. Thanakorn Sukkasem",
        legal_name_locked_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
  }

  let thanakornEnrollment = await db
    .selectFrom("enrollments")
    .select("id")
    .where("user_id", "=", thanakorn.id)
    .where("course_id", "=", course.id)
    .executeTakeFirst();

  let thanakornEnrollmentId = thanakornEnrollment?.id;
  if (!thanakornEnrollment) {
    const e = await db
      .insertInto("enrollments")
      .values({
        user_id: thanakorn.id,
        course_id: course.id,
        status: "in_progress",
        enrolled_at: new Date(Date.now() - 2 * 86400000),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    thanakornEnrollmentId = e.id;
  }

  // All 10 lessons completed for Thanakorn
  for (const l of lessons) {
    await db
      .insertInto("lesson_progress")
      .values({
        enrollment_id: thanakornEnrollmentId!,
        lesson_id: l.id,
        is_completed: true,
        accumulated_valid_sec: l.duration_sec,
        max_watched_sec: l.duration_sec,
        watched_chunks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        total_chunks_required: 10,
        last_position_sec: l.duration_sec,
      })
      .onConflict((oc) =>
        oc.columns(["enrollment_id", "lesson_id"]).doUpdateSet({
          is_completed: true,
          accumulated_valid_sec: l.duration_sec,
        }),
      )
      .execute();
  }

  // 3 failed quiz attempts today (score 60, 70, 70 < 80 passing) so he hits 3/3 attempts lock
  const countToday = await db
    .selectFrom("quiz_attempts")
    .select(sql<number>`count(*)::int`.as("n"))
    .where("enrollment_id", "=", thanakornEnrollmentId!)
    .where("assessment_type", "=", "post")
    .where("started_at", ">", sql<Date>`now() - interval '24 hours'`)
    .executeTakeFirstOrThrow();

  if (countToday.n < 3) {
    for (let attemptNum = countToday.n + 1; attemptNum <= 3; attemptNum++) {
      await db
        .insertInto("quiz_attempts")
        .values({
          enrollment_id: thanakornEnrollmentId!,
          assessment_type: "post",
          questions_snapshot: JSON.stringify(snapshot),
          user_answers: JSON.stringify([]),
          score_percentage: "70.00",
          is_passed: false,
          started_at: new Date(Date.now() - (4 - attemptNum) * 3600000),
          submitted_at: new Date(Date.now() - (4 - attemptNum) * 3600000 + 1200000),
          expires_at: new Date(Date.now() + 3600000),
        })
        .execute();
    }
  }
  console.log("✓ Learner 3: นายธนากร สุขเกษม (เรียนครบ 10 บท, สอบครบโควต้า 3/3 ครั้ง ติดล็อก 24h)");

  // 9. Add official institution announcements for realism
  console.log("\n--- Adding Official Platform Announcements ---");
  const announcements = [
    {
      slug: "krathong-course-launch-2026",
      title: "เปิดตัวหลักสูตรออนไลน์ “การประดิษฐ์กระทงรักษ์โลกและจริยธรรมสิ่งแวดล้อม” พร้อมรับใบรับรองดิจิทัล",
      summary: "สถาบันการอาชีวศึกษาภาคตะวันออกเปิดให้ประชาชนและนักศึกษาเข้าเรียนหลักสูตรอนุรักษ์สิ่งแวดล้อม 10 บทเรียน พร้อมระบบตรวจสอบใบรับรองดิจิทัลมาตรฐานสากล",
      body: `สถาบันการอาชีวศึกษาภาคตะวันออก (RIETC) ขอเชิญชวนนักเรียน นักศึกษา ครู อาจารย์ และประชาชนทั่วไป เข้าศึกษาหลักสูตรออนไลน์เชิงปฏิบัติการ **"การประดิษฐ์กระทงรักษ์โลกและจริยธรรมสิ่งแวดล้อม"**\n\n### ไฮไลต์ของหลักสูตร:\n- รวมเทคนิคงานใบตองและวัสดุธรรมชาติ 100% ไร้สารพิษและโลหะ\n- เรียนรู้ผ่าน 10 บทเรียนวิดีโอความคมชัดสูง พร้อมคำถามวัดความเข้าใจระหว่างคลิป\n- ผู้ที่ผ่านการประเมิน Post-test จะได้รับ **ใบประกาศนียบัตรดิจิทัล** ที่ลงนามด้วยเทคโนโลยี Ed25519 สามารถนำไปใช้เทียบโอนหน่วยกิตและใส่พอร์ตฟอลิโอได้ทันที\n\nผู้สนใจสามารถลงทะเบียนเข้าเรียนได้ฟรีตั้งแต่วันนี้เป็นต้นไป`,
      kind: "news",
      is_pinned: true,
      visibility: "published",
    },
    {
      slug: "ed25519-certificate-verification-guide",
      title: "แนวทางการตรวจสอบความถูกต้องของใบประกาศนียบัตรดิจิทัล (Digital Verification Guide)",
      summary: "แนะนำวิธีตรวจสอบใบรับรองดิจิทัลของสถาบันฯ ผ่านหน้าเว็บไซต์ตรวจสอบสาธารณะหรือสแกน QR Code",
      body: `ทุกใบประกาศนียบัตรที่ออกโดยระบบ UpSkill RIETC ได้รับการเข้ารหัสลับดิจิทัล (Cryptographic Signature) ด้วยมาตรฐาน Ed25519 เพื่อป้องกันการปลอมแปลงเอกสาร 100%\n\n### วิธีการตรวจสอบเอกสาร:\n1. เข้าไปที่เมนู **"ตรวจสอบใบรับรอง"** ที่แถบเมนูหลัก หรือไปที่ลิงก์ \`/verify\`\n2. กรอกรหัสใบรับรอง เช่น \`RIETC-2026-XXXX\` หรือสแกน QR Code บนเอกสาร\n3. ระบบจะตรวจสอบลายมือชื่อดิจิทัลและแสดงชื่อผู้สำเร็จการศึกษา วันที่ออกเอกสาร และรายละเอียดหลักสูตรที่ตรงกับฐานข้อมูลของสถาบันทันที`,
      kind: "notice",
      is_pinned: false,
      visibility: "published",
    },
  ];

  for (const ann of announcements) {
    const existing = await db
      .selectFrom("announcements")
      .select("id")
      .where("slug", "=", ann.slug)
      .executeTakeFirst();

    if (!existing) {
      await db
        .insertInto("announcements")
        .values({
          slug: ann.slug,
          title: ann.title,
          summary: ann.summary,
          body: ann.body,
          kind: ann.kind,
          is_pinned: ann.is_pinned,
          visibility: ann.visibility,
          created_by: learner.id,
          publish_at: new Date(),
        })
        .execute();
      console.log(`✓ Created announcement: ${ann.title}`);
    }
  }

  console.log("\n🎉 ALL SEEDING & END-TO-END FLOW COMPLETED SUCCESSFULLY!");
  console.log(`- Course URL: /courses/krathong-rak-lok`);
  console.log(`- Certificate URL: /courses/krathong-rak-lok/certificate`);
  if (certCode) {
    console.log(`- Public Verification URL: /verify/${certCode}`);
  }
}

main()
  .catch((err) => {
    console.error("Error executing complete-krathong-flow:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy();
  });
