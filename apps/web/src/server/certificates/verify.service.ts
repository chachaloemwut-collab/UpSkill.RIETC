/**
 * Public certificate verification (spec 5.4 #3). Exposes only what's needed: no user_id/email/enrollment_id.
 */
import "server-only";
import { CERTIFICATE_CODE_RE, formatStudyDurationTh, verifyCertificate } from "@upskill/core";
import { ctx } from "../context";
import { enqueueAdminAlert } from "../email/outbox.service";

export type PublicVerification =
  | { status: "not_found" }
  | { status: "tampered" } // signature fails or DB doesn't match -> alert the security team
  | {
      status: "valid" | "revoked" | "expired";
      code: string;
      recipientName: string;
      courseTitle: string;
      instructorName: string;
      studyDurationText: string;
      totalStudySec: number;
      quizScore: string;
      verifiedCourse: boolean;
      issuedAt: string;
      documentName: string;
      documentType: string;
      visualDigest: string;
      expiresAt?: string;
      revokedAt?: string;
      revokedReason?: string;
    };

export async function verifyPublicCertificate(rawCode: string): Promise<PublicVerification> {
  const code = rawCode.trim().toUpperCase();
  if (!CERTIFICATE_CODE_RE.test(code)) return { status: "not_found" };

  const { db, env } = ctx();
  const c = await db.selectFrom("certificates").selectAll().where("certificate_code", "=", code).executeTakeFirst();
  if (!c) return { status: "not_found" };

  const result = verifyCertificate(
    { signedPayload: c.signed_payload, signature: c.signature, keyId: c.signing_key_id },
    env.CERT_PUBLIC_KEYS,
    {
      code: c.certificate_code,
      enrollmentId: c.enrollment_id,
      userId: c.user_id,
      courseId: c.course_id,
      recipientName: c.recipient_name_snapshot,
      courseTitle: c.course_title_snapshot,
      instructorName: c.instructor_name_snapshot,
      totalStudySec: c.total_actual_study_sec,
      quizScore: Number(c.quiz_score_snapshot).toFixed(2),
      verifiedCourse: c.is_verified_course_snapshot,
      issuedAt: new Date(c.issued_at).toISOString(),
      documentName: c.document_name_snapshot,
      documentType: c.document_type_snapshot,
      expiresAt: c.expires_at ? new Date(c.expires_at).toISOString() : null,
    },
  );
  if (!result.ok) {
    // Signature failed or the DB row no longer matches the signed payload — this is either
    // DB tampering or a signing-key misconfiguration. Both are security events worth alerting.
    // Deduped per certificate so a single bad row can't spam the whole admin team.
    await enqueueAdminAlert(
      db,
      "ตรวจพบใบรับรองถูกแก้ไข",
      `รหัส ${code} ไม่ผ่านการตรวจสอบลายเซ็น (ฐานข้อมูลถูกแก้ไข หรือคีย์ลงนามไม่ตรง) โปรดตรวจสอบทันที`,
      `cert-tampered:${code}`,
      env.APP_ORIGIN,
    );
    return { status: "tampered" };
  }

  const p = result.payload;
  const expired = c.expires_at ? new Date(c.expires_at).getTime() <= Date.now() : false;
  return {
    status: c.revoked_at ? "revoked" : expired ? "expired" : "valid",
    code: p.code,
    recipientName: p.recipientName,
    courseTitle: p.courseTitle,
    instructorName: p.instructorName,
    studyDurationText: formatStudyDurationTh(p.totalStudySec),
    totalStudySec: p.totalStudySec,
    quizScore: p.quizScore,
    verifiedCourse: p.verifiedCourse,
    issuedAt: p.issuedAt,
    documentName: p.v === 2 ? p.documentName : c.document_name_snapshot,
    documentType: p.v === 2 ? p.documentType : c.document_type_snapshot,
    visualDigest: c.visual_digest,
    ...(c.expires_at ? { expiresAt: new Date(c.expires_at).toISOString() } : {}),
    ...(c.revoked_at ? { revokedAt: new Date(c.revoked_at).toISOString(), revokedReason: c.revoked_reason ?? "" } : {}),
  };
}
