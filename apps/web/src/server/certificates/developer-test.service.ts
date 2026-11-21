import "server-only";
import {
  computeVisualDigest,
  DEVELOPER_TEST_DOCUMENT_TYPE,
  DEVELOPER_TEST_EMAIL,
  generateCertificateCode,
  normalizeName,
  signCertificate,
  type CertificatePayload,
} from "@upskill/core";
import { ctx } from "../context";
import { HttpError } from "../http";
import { audit } from "../audit";
import { enqueueCertificatePdf } from "../queue";

export async function issueDeveloperTestCertificate(meta: { ip: string }): Promise<{ code: string; created: boolean }> {
  const { db, env } = ctx();

  // 1. Find or create the developer test account (CREATE-ONLY; never modifies password of existing account)
  let user = await db
    .selectFrom("users")
    .select(["id", "email", "legal_full_name_th", "legal_full_name_en", "legal_name_locked_at"])
    .where("email", "=", DEVELOPER_TEST_EMAIL)
    .executeTakeFirst();

  if (!user) {
    const created = await db.transaction().execute(async (trx) => {
      const u = await trx
        .insertInto("users")
        .values({
          email: DEVELOPER_TEST_EMAIL,
          role: "member",
          status: "active",
          email_verified_at: new Date(),
          legal_full_name_th: "เฉลิมวุฒิ ชา",
          legal_full_name_en: "Chaloemwut Cha",
          legal_name_locked_at: new Date(),
        })
        .returning(["id", "created_at"])
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("user_emails")
        .values({
          user_id: u.id,
          email: DEVELOPER_TEST_EMAIL,
          is_primary: true,
          verified_at: new Date(),
          created_at: u.created_at,
        })
        .execute();

      return u;
    });

    user = {
      id: created.id,
      email: DEVELOPER_TEST_EMAIL,
      legal_full_name_th: "เฉลิมวุฒิ ชา",
      legal_full_name_en: "Chaloemwut Cha",
      legal_name_locked_at: new Date(),
    };
  } else if (!user.legal_name_locked_at) {
    await db
      .updateTable("users")
      .set({
        legal_full_name_th: user.legal_full_name_th ?? "เฉลิมวุฒิ ชา",
        legal_full_name_en: user.legal_full_name_en ?? "Chaloemwut Cha",
        legal_name_locked_at: new Date(),
      })
      .where("id", "=", user.id)
      .execute();
  }

  // 2. Select the target course for the developer test credential
  const course = await db
    .selectFrom("courses")
    .select([
      "id",
      "title",
      "slug",
      "visibility",
      "is_verified_course",
      "credential_enabled",
      "credential_name_th",
      "credential_signer_name",
      "credential_signer_title",
      "credential_template_key",
      "credential_background_url",
      "credential_text_align",
    ])
    .where("credential_enabled", "=", true)
    .where("visibility", "in", ["published", "unlisted"])
    .orderBy("created_at", "asc")
    .limit(1)
    .executeTakeFirst();

  if (!course) {
    throw new HttpError(404, "COURSE_NOT_FOUND", "ไม่พบหลักสูตรที่เปิดรับรองสำหรับออกวุฒิบัตรทดสอบ");
  }

  // 3. One developer TEST certificate ever, in any course (checking only the selected course issued new test
  //    certificates and "completed" enrollments in real courses whenever the oldest published course changed)
  const existing = await db
    .selectFrom("certificates")
    .select(["certificate_code"])
    .where("user_id", "=", user.id)
    .where("document_type_snapshot", "=", DEVELOPER_TEST_DOCUMENT_TYPE)
    .orderBy("issued_at", "asc")
    .executeTakeFirst();

  if (existing) {
    return { code: existing.certificate_code, created: false };
  }

  // 4. Ensure enrollment exists
  let enrollment = await db
    .selectFrom("enrollments")
    .select(["id", "status"])
    .where("user_id", "=", user.id)
    .where("course_id", "=", course.id)
    .executeTakeFirst();

  if (!enrollment) {
    enrollment = await db
      .insertInto("enrollments")
      .values({
        user_id: user.id,
        course_id: course.id,
        status: "completed",
        enrolled_at: new Date(),
        completed_at: new Date(),
      })
      .returning(["id", "status"])
      .executeTakeFirstOrThrow();
  }

  // 5. Build and sign cryptographic certificate payload (v3)
  const issuedAt = new Date();
  const code = generateCertificateCode(issuedAt.getUTCFullYear());
  const recipientName = normalizeName(user.legal_full_name_th ?? user.legal_full_name_en ?? "เฉลิมวุฒิ ชา");
  const courseTitle = normalizeName(course.title);
  const instructorName = normalizeName(course.credential_signer_name ?? "ทีมพัฒนา UpSkill.RIETC (TEST)");
  const visualDigest = computeVisualDigest(recipientName, courseTitle, code);

  const payload: CertificatePayload = {
    v: 3,
    code,
    enrollmentId: enrollment.id,
    userId: user.id,
    courseId: course.id,
    recipientName,
    courseTitle,
    instructorName,
    totalStudySec: 0, // Explicitly 0: not a real learning completion
    quizScore: "100.00",
    verifiedCourse: Boolean(course.is_verified_course),
    issuedAt: issuedAt.toISOString(),
    documentName: "วุฒิบัตร (DEVELOPMENT TEST)",
    documentType: DEVELOPER_TEST_DOCUMENT_TYPE,
    expiresAt: null,
    signerTitle: course.credential_signer_title ?? "ผู้ดูแลระบบทดสอบ (Development / Integration Test)",
    achievement: "เอกสารทดสอบระบบ (TEST / DEVELOPMENT) — สำหรับทดสอบการออกและตรวจสอบวุฒิบัตรเท่านั้น มิใช่การสำเร็จการศึกษาจริง",
    visualDigest,
  };

  const signed = signCertificate(payload, env.CERT_SIGNING_ACTIVE_KID, env.CERT_SIGNING_PRIVATE_KEY);

  try {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("certificates")
        .values({
          certificate_code: payload.code,
          enrollment_id: payload.enrollmentId,
          user_id: payload.userId,
          course_id: payload.courseId,
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
          template_snapshot: course.credential_template_key || "standard",
          background_url_snapshot: course.credential_background_url || null,
          text_align_snapshot: course.credential_text_align || "center",
        })
        .execute();
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      const retry = await db
        .selectFrom("certificates")
        .select(["certificate_code"])
        .where("user_id", "=", user.id)
        .where("course_id", "=", course.id)
        .executeTakeFirst();
      if (retry) return { code: retry.certificate_code, created: false };
    }
    throw err;
  }

  // 6. Audit trail and enqueue PDF generation
  await audit(db, {
    action: "certificate.test_issued",
    userId: user.id,
    entityType: "certificate",
    ip: meta.ip,
    details: {
      code: payload.code,
      email: DEVELOPER_TEST_EMAIL,
      isDevelopmentTest: true,
      reason: "Developer test certificate for production testing",
    },
  });

  await enqueueCertificatePdf(payload.code);
  return { code: payload.code, created: true };
}
