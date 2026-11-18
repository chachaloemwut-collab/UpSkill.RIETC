import "server-only";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { HttpError } from "../http";
import { issueCertificate } from "../certificates/issue.service";

const PAGE_SIZE = 50;

export type AdminCertificateStatus = "valid" | "expired" | "revoked";

export async function listEligibleCoursesForAdmin() {
  return ctx()
    .db.selectFrom("courses")
    .select(["id", "title", "slug", "visibility"])
    .where("credential_enabled", "=", true)
    .orderBy("title", "asc")
    .execute();
}
 
export async function listCertificatesAdmin(input: {
  query?: string | undefined;
  status?: AdminCertificateStatus | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}) {
  const { db } = ctx();
  const q = (input.query ?? "").trim();
  const page = Math.max(1, Math.floor(input.page || 1));
  const pageSize = input.pageSize ? Math.min(100, Math.max(10, input.pageSize)) : PAGE_SIZE;

  // Counts by category
  const counts = await db
    .selectFrom("certificates")
    .select([
      sql<number>`count(*)::int`.as("total"),
      sql<number>`count(*) filter (where revoked_at is not null)::int`.as("revoked"),
      sql<number>`count(*) filter (where revoked_at is null and expires_at is not null and expires_at <= now())::int`.as("expired"),
      sql<number>`count(*) filter (where revoked_at is null and (expires_at is null or expires_at > now()))::int`.as("valid"),
    ])
    .executeTakeFirstOrThrow();

  let query = db
    .selectFrom("certificates as cert")
    .innerJoin("users as u", "u.id", "cert.user_id")
    .innerJoin("courses as c", "c.id", "cert.course_id")
    .select([
      "cert.id",
      "cert.certificate_code",
      "cert.recipient_name_snapshot",
      "cert.course_title_snapshot",
      "cert.instructor_name_snapshot",
      "cert.total_actual_study_sec",
      "cert.quiz_score_snapshot",
      "cert.is_verified_course_snapshot",
      "cert.issued_at",
      "cert.expires_at",
      "cert.revoked_at",
      "cert.revoked_reason",
      "cert.document_name_snapshot",
      "cert.document_type_snapshot",
      "u.id as user_id",
      "u.email as user_email",
      "c.id as course_id",
      "c.slug as course_slug",
    ]);

  if (q) {
    query = query.where((eb) =>
      eb.or([
        eb("cert.certificate_code", "ilike", `%${q}%`),
        eb("cert.recipient_name_snapshot", "ilike", `%${q}%`),
        eb("cert.course_title_snapshot", "ilike", `%${q}%`),
        eb("u.email", "ilike", `%${q}%`),
      ]),
    );
  }

  if (input.status === "revoked") {
    query = query.where("cert.revoked_at", "is not", null);
  } else if (input.status === "expired") {
    query = query
      .where("cert.revoked_at", "is", null)
      .where("cert.expires_at", "is not", null)
      .where("cert.expires_at", "<=", new Date());
  } else if (input.status === "valid") {
    query = query
      .where("cert.revoked_at", "is", null)
      .where((eb) => eb.or([eb("cert.expires_at", "is", null), eb("cert.expires_at", ">", new Date())]));
  }

  // The page count must use the same search + status filters as the rows (the category totals above ignore the search)
  const filtered = await db
    .selectFrom(query.as("f"))
    .select(sql<number>`count(*)::int`.as("n"))
    .executeTakeFirstOrThrow();

  const certificates = await query
    .orderBy("cert.issued_at", "desc")
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .execute();

  return {
    certificates: certificates.map((c) => {
      const isExpired = c.expires_at ? new Date(c.expires_at).getTime() <= Date.now() : false;
      const status: AdminCertificateStatus = c.revoked_at ? "revoked" : isExpired ? "expired" : "valid";
      return {
        ...c,
        status,
        issued_at: new Date(c.issued_at).toISOString(),
        expires_at: c.expires_at ? new Date(c.expires_at).toISOString() : null,
        revoked_at: c.revoked_at ? new Date(c.revoked_at).toISOString() : null,
      };
    }),
    counts: {
      total: counts.total,
      valid: counts.valid,
      expired: counts.expired,
      revoked: counts.revoked,
    },
    page,
    pageSize,
    total: filtered.n,
  };
}

import { revokeCertificate } from "./admin.service";

export async function revokeCertificateAdmin(
  adminId: string,
  certCode: string,
  reason: string,
  meta: { ip: string },
) {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 5) {
    throw new HttpError(400, "REASON_TOO_SHORT", "กรุณาระบุเหตุผลในการเพิกถอนอย่างน้อย 5 ตัวอักษร");
  }
  await revokeCertificate(adminId, certCode.trim().toUpperCase(), trimmedReason, meta);
  return { ok: true, revokedAt: new Date().toISOString(), revokedReason: trimmedReason };
}

export async function adminManualIssueCertificate(
  adminId: string,
  input: {
    userId: string;
    courseId: string;
    score?: number | undefined;
    reason?: string | undefined;
  },
  meta: { ip: string },
) {
  const { db } = ctx();

  const user = await db
    .selectFrom("users")
    .select(["id", "status", "legal_full_name_th", "legal_full_name_en", "legal_name_locked_at", "email"])
    .where("id", "=", input.userId)
    .executeTakeFirst();
  if (!user || user.status !== "active") throw new HttpError(404, "USER_NOT_FOUND", "ไม่พบผู้ใช้หรือบัญชีไม่ได้เปิดใช้งาน");

  const course = await db
    .selectFrom("courses")
    .select(["id", "title", "visibility", "credential_enabled"])
    .where("id", "=", input.courseId)
    .executeTakeFirst();
  if (!course) throw new HttpError(404, "COURSE_NOT_FOUND", "ไม่พบหลักสูตรนี้");
  if (!course.credential_enabled) throw new HttpError(400, "CREDENTIAL_NOT_ENABLED", "หลักสูตรนี้ไม่ได้เปิดใช้งานใบรับรอง");

  // Ensure legal name is locked
  if (!user.legal_name_locked_at) {
    const defaultName = user.legal_full_name_th ?? user.legal_full_name_en ?? user.email.split("@")[0] ?? "Learner";
    await db
      .updateTable("users")
      .set({
        legal_full_name_th: user.legal_full_name_th ?? defaultName,
        legal_name_locked_at: new Date(),
      })
      .where("id", "=", user.id)
      .execute();
  }

  // Ensure enrollment exists and is marked completed
  const enrollment = await db
    .selectFrom("enrollments")
    .select(["id", "status"])
    .where("user_id", "=", user.id)
    .where("course_id", "=", course.id)
    .executeTakeFirst();

  if (!enrollment) {
    await db
      .insertInto("enrollments")
      .values({
        user_id: user.id,
        course_id: course.id,
        status: "completed",
        enrolled_at: new Date(),
        completed_at: new Date(),
      })
      .execute();
  } else if (enrollment.status !== "completed") {
    await db
      .updateTable("enrollments")
      .set({ status: "completed", completed_at: new Date() })
      .where("id", "=", enrollment.id)
      .execute();
  }

  // Issue certificate with admin override
  const result = await issueCertificate({
    userId: user.id,
    courseId: course.id,
    ip: meta.ip,
    locale: "th",
    adminOverride: {
      score: input.score ?? 100,
      reason: input.reason ?? `Admin manual override by ${adminId}`,
    },
  });

  return result;
}
