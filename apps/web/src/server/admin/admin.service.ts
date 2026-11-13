/** Admin operations. Routes using these must declare roles: ["admin"]. Every change is audited. */
import "server-only";
import { CERTIFICATE_CODE_RE } from "@upskill/core";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { addEmailToOutbox } from "../email/outbox.service";
import { HttpError } from "../http";
import { audit } from "../audit";
import { revokeAllSessions } from "../auth/session";

export async function adminOverview() {
  const { db } = ctx();
  const courses = await db
    .selectFrom("courses as c")
    .innerJoin("users as u", "u.id", "c.instructor_id")
    .select(["c.id", "c.slug", "c.title", "c.visibility", "c.is_verified_course", "u.email as instructor_email"])
    .orderBy("c.updated_at", "desc")
    .limit(200)
    .execute();
  const flags = await db
    .selectFrom("anticheat_events as a")
    .innerJoin("users as u", "u.id", "a.user_id")
    .innerJoin("lessons as l", "l.id", "a.lesson_id")
    .select(["a.id", "a.reason", "a.details", "a.created_at", "u.email", "l.title as lesson_title"])
    .orderBy("a.created_at", "desc")
    .limit(100)
    .execute();
  const topFlagged = await db
    .selectFrom("anticheat_events as a")
    .innerJoin("users as u", "u.id", "a.user_id")
    .select(["u.id", "u.email", sql<number>`count(*)::int`.as("n")])
    .where("a.created_at", ">", sql<Date>`now() - interval '30 days'`)
    .groupBy(["u.id", "u.email"])
    .orderBy("n", "desc")
    .limit(20)
    .execute();
  const stats = await db
    .selectNoFrom([
      sql<number>`(select count(*)::int from users)`.as("users"),
      sql<number>`(select count(*)::int from courses where visibility = 'published')`.as("publishedCourses"),
      sql<number>`(select count(*)::int from enrollments)`.as("enrollments"),
      sql<number>`(select count(*)::int from certificates where revoked_at is null)`.as("certificates"),
      sql<number>`(select count(*)::int from anticheat_events where created_at > now() - interval '7 days')`.as("flags7d"),
      sql<number>`(select count(*)::int from email_outbox where status in ('pending','processing'))`.as("emailPending"),
      sql<number>`(select count(*)::int from email_outbox where status = 'failed')`.as("emailFailed"),
    ])
    .executeTakeFirstOrThrow();
  const emails = await db
    .selectFrom("email_outbox")
    .select(["id", "recipient_email", "template_key", "status", "attempt_count", "created_at", "sent_at", "last_error_code"])
    .orderBy("created_at", "desc")
    .limit(100)
    .execute();
  const suppressions = await db.selectFrom("email_suppressions").select(["email", "reason", "created_at"]).orderBy("created_at", "desc").limit(100).execute();
  return { courses, flags, topFlagged, stats, emails, suppressions };
}

export async function retryEmailDelivery(id: string) {
  const result = await ctx()
    .db.updateTable("email_outbox")
    .set({ status: "pending", attempt_count: 0, next_attempt_at: new Date(), claimed_at: null, failed_at: null, last_error_code: null, last_error_message: null })
    .where("id", "=", id)
    .where("status", "in", ["failed", "suppressed"])
    .executeTakeFirst();
  if (Number(result.numUpdatedRows) === 0) throw new HttpError(409, "EMAIL_NOT_RETRYABLE");
}

export async function removeEmailSuppression(email: string) {
  await ctx().db.deleteFrom("email_suppressions").where("email", "=", email.trim().toLowerCase()).execute();
}

export async function adminUpdateCourse(
  adminId: string,
  courseId: string,
  patch: { visibility?: "suspended" | "draft" | undefined; is_verified_course?: boolean | undefined },
  meta: { ip: string },
) {
  const { db, env } = ctx();
  const set = {
    ...(patch.visibility ? { visibility: patch.visibility } : {}),
    ...(patch.is_verified_course !== undefined ? { is_verified_course: patch.is_verified_course } : {}),
  };
  if (Object.keys(set).length === 0) return;
  const course = await db
    .selectFrom("courses as c")
    .innerJoin("users as u", "u.id", "c.instructor_id")
    .select(["c.title", "u.id as instructor_id", "u.email as instructor_email"])
    .where("c.id", "=", courseId)
    .executeTakeFirst();
  if (!course) throw new HttpError(404, "NOT_FOUND");
  const eventAt = new Date();
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("courses").set(set).where("id", "=", courseId).execute();
    if (patch.visibility) {
      const statusLabel = patch.visibility === "suspended" ? "ระงับ" : "ฉบับร่าง";
      await addEmailToOutbox(
        trx,
        { template: "course-status-changed", to: course.instructor_email, courseTitle: course.title, statusLabel, manageLink: `${env.APP_ORIGIN}/instructor/courses/${courseId}` },
        { userId: course.instructor_id, deduplicationKey: `course-status:${courseId}:${patch.visibility}:${eventAt.toISOString()}` },
      );
      if (patch.visibility === "suspended") {
        const learners = await trx
          .selectFrom("enrollments as e")
          .innerJoin("users as u", "u.id", "e.user_id")
          .select(["u.id", "u.email"])
          .where("e.course_id", "=", courseId)
          .where("e.status", "!=", "revoked")
          .execute();
        for (const learner of learners) {
          await addEmailToOutbox(
            trx,
            { template: "course-suspended", to: learner.email, courseTitle: course.title },
            { userId: learner.id, deduplicationKey: `course-suspended:${courseId}:${learner.id}:${eventAt.toISOString()}` },
          );
        }
      }
    }
  });
  if (patch.visibility === "suspended") {
    await audit(db, { action: "course.suspended", userId: adminId, entityType: "course", entityId: courseId, ip: meta.ip });
  }
}

export async function revokeCertificate(adminId: string, rawCode: string, reason: string, meta: { ip: string }) {
  const code = rawCode.trim().toUpperCase();
  if (!CERTIFICATE_CODE_RE.test(code)) throw new HttpError(404, "NOT_FOUND");
  const { db, env } = ctx();
  const certificate = await db
    .selectFrom("certificates as c")
    .innerJoin("users as u", "u.id", "c.user_id")
    .select(["c.id", "c.user_id", "c.course_title_snapshot", "u.email"])
    .where("c.certificate_code", "=", code)
    .where("c.revoked_at", "is", null)
    .executeTakeFirst();
  if (!certificate) throw new HttpError(409, "NOT_FOUND_OR_ALREADY_REVOKED");
  const r = await db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("certificates")
      .set({ revoked_at: new Date(), revoked_reason: reason.trim() })
      .where("id", "=", certificate.id)
      .where("revoked_at", "is", null)
      .returning("id")
      .executeTakeFirst();
    if (!updated) return null;
    await addEmailToOutbox(
      trx,
      { template: "credential-revoked", to: certificate.email, documentName: "ใบรับรอง", courseTitle: certificate.course_title_snapshot, code, reason: reason.trim(), verifyLink: `${env.APP_ORIGIN}/verify/${encodeURIComponent(code)}` },
      { userId: certificate.user_id, deduplicationKey: `credential-revoked:${certificate.id}` },
    );
    return updated;
  });
  if (!r) throw new HttpError(409, "NOT_FOUND_OR_ALREADY_REVOKED");
  await audit(db, { action: "certificate.revoked", userId: adminId, entityType: "certificate", entityId: r.id, ip: meta.ip, details: { code, reason } });
}

export async function adminUpdateUser(
  adminId: string,
  email: string,
  patch: { role?: "member" | "instructor" | "admin" | undefined; status?: "active" | "suspended" | "banned" | undefined },
) {
  const { db } = ctx();
  const user = await db.selectFrom("users").select(["id", "email", "status", "is_system_owner"]).where("email", "=", email.trim().toLowerCase()).executeTakeFirst();
  if (!user) throw new HttpError(404, "NOT_FOUND");
  if (user.id === adminId) throw new HttpError(409, "CANNOT_MODIFY_SELF");
  if (user.is_system_owner) throw new HttpError(409, "SYSTEM_OWNER_PROTECTED");
  const set = { ...(patch.role ? { role: patch.role } : {}), ...(patch.status ? { status: patch.status } : {}) };
  if (Object.keys(set).length === 0) return;
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("users").set(set).where("id", "=", user.id).execute();
    if (patch.status && patch.status !== user.status) {
      const labels = { active: "ใช้งาน", suspended: "ระงับชั่วคราว", banned: "ระงับถาวร" } as const;
      await addEmailToOutbox(
        trx,
        { template: "account-status-changed", to: user.email, statusLabel: labels[patch.status] },
        { userId: user.id, deduplicationKey: `account-status:${user.id}:${patch.status}:${new Date().toISOString()}` },
      );
    }
  });
  // Role/status change: force re-login so no session keeps stale privileges
  await revokeAllSessions(user.id, "admin_update");
}
