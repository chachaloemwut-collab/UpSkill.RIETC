import type { Database } from "@upskill/db";
import type { Env } from "@upskill/infra/env";
import {
  computeVisualDigest,
  DEVELOPER_TEST_DOCUMENT_TYPE,
  DEVELOPER_TEST_EMAIL,
  generateCertificateCode,
  normalizeName,
  signCertificate,
  type CertificatePayload,
} from "@upskill/core";
import { logger } from "@upskill/infra/logger";
import { renderCertificatePdf } from "./jobs/render-certificate-pdf.ts";

/**
 * Bootstraps a developer test certificate for cha.chaloemwut@gmail.com on startup (CREATE-ONLY).
 *
 * Production rule:
 *  - Only ever targets cha.chaloemwut@gmail.com.
 *  - Clearly sets documentType to "development_test", marking it as TEST / DEVELOPMENT.
 *  - Explicitly records totalStudySec = 0 so no false claim of learning completion is made.
 *  - If an account already exists for cha.chaloemwut@gmail.com, its password, role, and sessions are untouched.
 *  - A newly created account has NO password (the repository is public, so a password in code is public too):
 *    its owner signs in with Google or sets a password via "forgot password" sent to that mailbox.
 *  - If a developer TEST certificate already exists in any course, does nothing (one test certificate ever).
 */
export async function ensureDeveloperTestCertificate(db: Database, env: Env): Promise<void> {
  if (!env.CERT_SIGNING_PRIVATE_KEY || !env.CERT_SIGNING_ACTIVE_KID) {
    logger.warn("CERT_SIGNING_PRIVATE_KEY not configured; developer test certificate bootstrap skipped");
    return;
  }

  // 1. Check if course exists
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
    logger.info("no published credential course available yet; developer test certificate skipped");
    return;
  }

  // 2. Find or create user
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
    logger.info("created developer test user account for cha.chaloemwut@gmail.com");
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

  // 3. Check if a developer TEST certificate already exists — in ANY course. Checking only the selected course
  //    issued a new test certificate (and a "completed" enrollment) in a real course whenever the oldest
  //    published course changed, e.g. after an old course was archived.
  const existing = await db
    .selectFrom("certificates")
    .select(["certificate_code", "pdf_ready_at"])
    .where("user_id", "=", user.id)
    .where("document_type_snapshot", "=", DEVELOPER_TEST_DOCUMENT_TYPE)
    .orderBy("issued_at", "asc")
    .executeTakeFirst();

  if (existing) {
    if (!existing.pdf_ready_at) {
      try {
        await renderCertificatePdf(db, env, existing.certificate_code);
        logger.info({ code: existing.certificate_code }, "rendered pending pdf for existing developer test certificate");
      } catch (err) {
        logger.warn({ code: existing.certificate_code, err: (err as Error).message }, "could not render pdf for existing developer certificate");
      }
    }
    logger.info({ code: existing.certificate_code }, "developer test certificate already exists for cha.chaloemwut@gmail.com");
    return;
  }

  // 4. Ensure enrollment exists
  let enrollment = await db
    .selectFrom("enrollments")
    .select(["id"])
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
      .returning(["id"])
      .executeTakeFirstOrThrow();
  }

  // 5. Sign and issue certificate
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
    totalStudySec: 0,
    quizScore: "100.00",
    verifiedCourse: Boolean(course.is_verified_course),
    issuedAt: issuedAt.toISOString(),
    documentName: "ใบประกาศนียบัตร (DEVELOPMENT TEST)",
    documentType: DEVELOPER_TEST_DOCUMENT_TYPE,
    expiresAt: null,
    signerTitle: course.credential_signer_title ?? "ผู้ดูแลระบบทดสอบ (Development / Integration Test)",
    achievement: "เอกสารทดสอบระบบ (TEST / DEVELOPMENT) — สำหรับทดสอบการออกและตรวจสอบใบประกาศนียบัตรเท่านั้น มิใช่การสำเร็จการศึกษาจริง",
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

      await trx
        .insertInto("audit_logs")
        .values({
          user_id: user!.id,
          action: "certificate.test_issued",
          entity_type: "certificate",
          details: {
            code: payload.code,
            email: DEVELOPER_TEST_EMAIL,
            isDevelopmentTest: true,
            bootstrappedBy: "worker",
          },
        })
        .execute();
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      logger.info({ code: payload.code }, "developer test certificate already inserted concurrently");
      return;
    }
    throw err;
  }

  // 6. Immediately render PDF
  try {
    await renderCertificatePdf(db, env, payload.code);
    logger.info({ code: payload.code }, "developer test certificate issued and rendered for cha.chaloemwut@gmail.com");
  } catch (err) {
    logger.warn({ code: payload.code, err: (err as Error).message }, "pdf render deferred for developer test certificate");
  }
}
