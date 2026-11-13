/**
 * POST /api/courses/:id/certificate/issue (spec 5.4)
 * Idempotent: calling it again returns the existing certificate (UNIQUE enrollment_id).
 */
import "server-only";
import { sql } from "@upskill/db";
import { generateCertificateCode, normalizeName, signCertificate, type CertificatePayload } from "@upskill/core";
import { ctx } from "../context";
import { addEmailToOutbox } from "../email/outbox.service";
import { HttpError } from "../http";
import { audit } from "../audit";
import { enqueueCertificatePdf } from "../queue";

export async function issueCertificate(input: { userId: string; courseId: string; ip: string; locale: "th" | "en" }) {
  const { db, env } = ctx();

  const existing = await db
    .selectFrom("certificates")
    .select(["certificate_code"])
    .where("user_id", "=", input.userId)
    .where("course_id", "=", input.courseId)
    .executeTakeFirst();
  if (existing) return { code: existing.certificate_code, created: false };

  const data = await db
    .selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .innerJoin("users as u", "u.id", "e.user_id")
    .innerJoin("users as ins", "ins.id", "c.instructor_id")
    .select([
      "e.id as enrollment_id", "e.status", "c.title", "c.visibility", "c.is_verified_course", "c.total_duration_sec",
      "c.credential_enabled", "c.credential_type", "c.credential_name_th", "c.credential_name_en", "c.credential_validity_days", "c.credential_signer_name",
      "u.email", "u.legal_full_name_th", "u.legal_full_name_en", "u.legal_name_locked_at",
      "ins.legal_full_name_th as ins_th", "ins.legal_full_name_en as ins_en", "ins.email as ins_email",
    ])
    .where("e.user_id", "=", input.userId)
    .where("e.course_id", "=", input.courseId)
    .executeTakeFirst();

  if (!data) throw new HttpError(404, "NOT_FOUND");
  if (data.status !== "completed") throw new HttpError(403, "COURSE_NOT_COMPLETED");
  if (data.visibility !== "published" && data.visibility !== "unlisted") throw new HttpError(403, "COURSE_UNAVAILABLE");
  if (data.total_duration_sec < 600) throw new HttpError(403, "COURSE_NOT_ELIGIBLE");
  if (!data.credential_enabled) throw new HttpError(403, "CREDENTIAL_DISABLED");
  if (!data.legal_name_locked_at) throw new HttpError(409, "LEGAL_NAME_NOT_LOCKED");

  const recipient = input.locale === "en" ? data.legal_full_name_en : data.legal_full_name_th;
  if (!recipient) throw new HttpError(409, "LEGAL_NAME_MISSING");

  const stats = await db
    .selectFrom("lesson_progress")
    .select(sql<number>`coalesce(sum(accumulated_valid_sec), 0)::int`.as("study_sec"))
    .where("enrollment_id", "=", data.enrollment_id)
    .executeTakeFirstOrThrow();
  const best = await db
    .selectFrom("quiz_attempts")
    .select(sql<string>`max(score_percentage)::text`.as("score"))
    .where("enrollment_id", "=", data.enrollment_id)
    .where("is_passed", "=", true)
    .executeTakeFirstOrThrow();
  if (!best.score) throw new HttpError(403, "QUIZ_NOT_PASSED");

  // JS Date is millisecond precision -> the value stored in timestamptz (microseconds) round-trips exactly
  const issuedAt = new Date();
  const expiresAt = data.credential_validity_days ? new Date(issuedAt.getTime() + data.credential_validity_days * 86_400_000) : null;
  const documentName = input.locale === "en" && data.credential_name_en ? data.credential_name_en : data.credential_name_th;
  const payload: CertificatePayload = {
    v: 2,
    code: generateCertificateCode(issuedAt.getUTCFullYear()),
    enrollmentId: data.enrollment_id,
    userId: input.userId,
    courseId: input.courseId,
    recipientName: normalizeName(recipient),
    courseTitle: normalizeName(data.title),
    instructorName: normalizeName(data.credential_signer_name ?? data.ins_th ?? data.ins_en ?? data.ins_email),
    totalStudySec: stats.study_sec,
    quizScore: Number(best.score).toFixed(2),
    verifiedCourse: data.is_verified_course,
    issuedAt: issuedAt.toISOString(),
    documentName: normalizeName(documentName),
    documentType: data.credential_type,
    expiresAt: expiresAt?.toISOString() ?? null,
  };
  const signed = signCertificate(payload, env.CERT_SIGNING_ACTIVE_KID, env.CERT_SIGNING_PRIVATE_KEY);

  try {
    await db.transaction().execute(async (trx) => {
      const certificate = await trx
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
          payload_version: 2,
          document_name_snapshot: payload.documentName,
          document_type_snapshot: payload.documentType,
          expires_at: expiresAt,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await addEmailToOutbox(
        trx,
        { template: "credential-requested", to: data.email, documentName: payload.documentName, courseTitle: payload.courseTitle, code: payload.code },
        { userId: input.userId, deduplicationKey: `credential-requested:${certificate.id}` },
      );
    });
  } catch (err) {
    // Two concurrent requests: unique(enrollment_id) blocks the duplicate -> return the existing one
    if ((err as { code?: string }).code === "23505") return issueCertificate(input);
    throw err;
  }

  await audit(db, { action: "certificate.issued", userId: input.userId, entityType: "certificate", ip: input.ip, details: { code: payload.code } });
  await enqueueCertificatePdf(payload.code);
  return { code: payload.code, created: true };
}
