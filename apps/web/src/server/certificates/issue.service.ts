/**
 * POST /api/courses/:id/certificate/issue (spec 5.4)
 * Idempotent: calling it again returns the existing certificate (UNIQUE enrollment_id).
 */
import "server-only";
import { sql } from "@upskill/db";
import { computeVisualDigest, generateCertificateCode, normalizeName, signCertificate, type CertificatePayload } from "@upskill/core";
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
      "c.credential_enabled", "c.credential_type", "c.credential_name_th", "c.credential_name_en", "c.credential_validity_days", "c.credential_signer_name", "c.credential_signer_title", "c.credential_achievement_th", "c.credential_achievement_en", "c.credential_template_key", "c.credential_background_url", "c.credential_text_align",
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
    .where("assessment_type", "=", "post")
    .where("is_passed", "=", true)
    .executeTakeFirstOrThrow();
  if (!best.score) throw new HttpError(403, "QUIZ_NOT_PASSED");

  // JS Date is millisecond precision -> the value stored in timestamptz (microseconds) round-trips exactly
  const issuedAt = new Date();
  const expiresAt = data.credential_validity_days ? new Date(issuedAt.getTime() + data.credential_validity_days * 86_400_000) : null;
  const documentName = input.locale === "en" && data.credential_name_en ? data.credential_name_en : data.credential_name_th;
  const achievementRaw = (input.locale === "en" && data.credential_achievement_en ? data.credential_achievement_en : data.credential_achievement_th) ?? null;
  const code = generateCertificateCode(issuedAt.getUTCFullYear());
  const recipientName = normalizeName(recipient);
  const courseTitle = normalizeName(data.title);
  const visualDigest = computeVisualDigest(recipientName, courseTitle, code);
  const payload: CertificatePayload = {
    v: 3,
    code,
    enrollmentId: data.enrollment_id,
    userId: input.userId,
    courseId: input.courseId,
    recipientName,
    courseTitle,
    instructorName: normalizeName(data.credential_signer_name ?? data.ins_th ?? data.ins_en ?? data.ins_email),
    totalStudySec: stats.study_sec,
    quizScore: Number(best.score).toFixed(2),
    verifiedCourse: data.is_verified_course,
    issuedAt: issuedAt.toISOString(),
    documentName: normalizeName(documentName),
    documentType: data.credential_type,
    expiresAt: expiresAt?.toISOString() ?? null,
    signerTitle: data.credential_signer_title ?? null,
    achievement: achievementRaw ? normalizeName(achievementRaw) : null,
    visualDigest,
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
          payload_version: 3,
          document_name_snapshot: payload.documentName,
          document_type_snapshot: payload.documentType,
          expires_at: expiresAt,
          signer_title_snapshot: payload.signerTitle,
          achievement_snapshot: payload.achievement,
          visual_digest: payload.visualDigest,
          template_snapshot: data.credential_template_key,
          background_url_snapshot: data.credential_background_url,
          text_align_snapshot: data.credential_text_align,
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

/**
 * Program-level certificate (payload v4): issued once per user+program when every required
 * course of the program is completed through an approved cohort registration.
 */
export async function issueProgramCertificate(input: { userId: string; programId: string; ip: string }) {
  const { db, env } = ctx();

  const existing = await db
    .selectFrom("certificates")
    .select(["certificate_code"])
    .where("user_id", "=", input.userId)
    .where("program_id", "=", input.programId)
    .executeTakeFirst();
  if (existing) return { code: existing.certificate_code, created: false };

  const reg = await db
    .selectFrom("cohort_registrations as r")
    .innerJoin("program_cohorts as c", "c.id", "r.cohort_id")
    .select(["r.cohort_id"])
    .where("r.user_id", "=", input.userId)
    .where("c.program_id", "=", input.programId)
    .where("r.status", "=", "approved")
    .orderBy("r.applied_at", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!reg) throw new HttpError(403, "NOT_APPROVED");

  const required = await db
    .selectFrom("program_courses")
    .select(["course_id"])
    .where("program_id", "=", input.programId)
    .where("is_required", "=", true)
    .execute();
  if (required.length === 0) throw new HttpError(403, "PROGRAM_EMPTY");

  const completed = await db
    .selectFrom("enrollments")
    .select(["course_id"])
    .where("user_id", "=", input.userId)
    .where("cohort_id", "=", reg.cohort_id)
    .where("status", "=", "completed")
    .execute();
  const done = new Set(completed.map((e) => e.course_id));
  if (required.some((r) => !done.has(r.course_id))) throw new HttpError(403, "PROGRAM_NOT_COMPLETED");

  const program = await db
    .selectFrom("programs as p")
    .innerJoin("users as u", "u.id", "p.created_by")
    .select(["p.title", "u.legal_full_name_th as signer_th", "u.legal_full_name_en as signer_en", "u.email as signer_email"])
    .where("p.id", "=", input.programId)
    .executeTakeFirstOrThrow();
  const user = await db.selectFrom("users").select(["legal_full_name_th", "legal_full_name_en", "legal_name_locked_at"]).where("id", "=", input.userId).executeTakeFirstOrThrow();
  if (!user.legal_name_locked_at) throw new HttpError(409, "LEGAL_NAME_NOT_LOCKED");
  const recipient = user.legal_full_name_th ?? user.legal_full_name_en;
  if (!recipient) throw new HttpError(409, "LEGAL_NAME_MISSING");

  const study = await db
    .selectFrom("lesson_progress as lp")
    .innerJoin("lessons as l", "l.id", "lp.lesson_id")
    .innerJoin("program_courses as pc", "pc.course_id", "l.course_id")
    .innerJoin("enrollments as e", "e.id", "lp.enrollment_id")
    .select(sql<number>`coalesce(sum(lp.accumulated_valid_sec), 0)::int`.as("study_sec"))
    .where("pc.program_id", "=", input.programId)
    .where("pc.is_required", "=", true)
    .where("e.user_id", "=", input.userId)
    .where("e.cohort_id", "=", reg.cohort_id)
    .executeTakeFirstOrThrow();
  const scores = await db
    .selectFrom("quiz_attempts as qa")
    .innerJoin("enrollments as e", "e.id", "qa.enrollment_id")
    .innerJoin("program_courses as pc", "pc.course_id", "e.course_id")
    .select(sql<string>`round(avg(qa.score_percentage), 2)::text`.as("avg"))
    .where("qa.assessment_type", "=", "post")
    .where("qa.is_passed", "=", true)
    .where("pc.program_id", "=", input.programId)
    .where("pc.is_required", "=", true)
    .where("e.user_id", "=", input.userId)
    .where("e.cohort_id", "=", reg.cohort_id)
    .executeTakeFirstOrThrow();

  const issuedAt = new Date();
  const code = generateCertificateCode(issuedAt.getUTCFullYear());
  const recipientName = normalizeName(recipient);
  const programTitle = normalizeName(program.title);
  const signerName = normalizeName(program.signer_th ?? program.signer_en ?? program.signer_email);
  const visualDigest = computeVisualDigest(recipientName, programTitle, code);
  const payload: CertificatePayload = {
    v: 4,
    code,
    enrollmentId: null,
    userId: input.userId,
    courseId: null,
    programId: input.programId,
    cohortId: reg.cohort_id,
    recipientName,
    courseTitle: programTitle,
    instructorName: signerName,
    totalStudySec: study.study_sec,
    quizScore: Number(scores.avg).toFixed(2),
    verifiedCourse: false,
    issuedAt: issuedAt.toISOString(),
    documentName: "ใบประกาศนียบัตร",
    documentType: "program",
    expiresAt: null,
    signerTitle: null,
    achievement: "ผ่านการอบรมครบทุกวิชาบังคับของหลักสูตร",
    visualDigest,
  };
  const signed = signCertificate(payload, env.CERT_SIGNING_ACTIVE_KID, env.CERT_SIGNING_PRIVATE_KEY);

  try {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("certificates")
        .values({
          certificate_code: payload.code,
          enrollment_id: null,
          user_id: payload.userId,
          course_id: null,
          program_id: payload.programId,
          cohort_id: payload.cohortId,
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
          payload_version: 4,
          document_name_snapshot: payload.documentName,
          document_type_snapshot: payload.documentType,
          expires_at: null,
          signer_title_snapshot: null,
          achievement_snapshot: payload.achievement,
          visual_digest: payload.visualDigest,
        })
        .execute();
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return issueProgramCertificate(input);
    throw err;
  }

  await audit(db, { action: "certificate.issued", userId: input.userId, entityType: "program", entityId: input.programId, ip: input.ip, details: { code: payload.code } });
  await enqueueCertificatePdf(payload.code);
  return { code: payload.code, created: true };
}
