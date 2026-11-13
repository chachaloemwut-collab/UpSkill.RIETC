/** Admin operations. Routes using these must declare roles: ["admin"]. Every change is audited. */
import "server-only";
import { CERTIFICATE_CODE_RE } from "@upskill/core";
import { sql } from "@upskill/db";
import { ctx } from "../context";
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
  return { courses, flags, topFlagged };
}

export async function adminUpdateCourse(
  adminId: string,
  courseId: string,
  patch: { visibility?: "suspended" | "draft" | undefined; is_verified_course?: boolean | undefined },
  meta: { ip: string },
) {
  const { db } = ctx();
  const set = {
    ...(patch.visibility ? { visibility: patch.visibility } : {}),
    ...(patch.is_verified_course !== undefined ? { is_verified_course: patch.is_verified_course } : {}),
  };
  if (Object.keys(set).length === 0) return;
  const r = await db.updateTable("courses").set(set).where("id", "=", courseId).executeTakeFirst();
  if (Number(r.numUpdatedRows) === 0) throw new HttpError(404, "NOT_FOUND");
  if (patch.visibility === "suspended") {
    await audit(db, { action: "course.suspended", userId: adminId, entityType: "course", entityId: courseId, ip: meta.ip });
  }
}

export async function revokeCertificate(adminId: string, rawCode: string, reason: string, meta: { ip: string }) {
  const code = rawCode.trim().toUpperCase();
  if (!CERTIFICATE_CODE_RE.test(code)) throw new HttpError(404, "NOT_FOUND");
  const { db } = ctx();
  const r = await db
    .updateTable("certificates")
    .set({ revoked_at: new Date(), revoked_reason: reason.trim() })
    .where("certificate_code", "=", code)
    .where("revoked_at", "is", null)
    .returning("id")
    .executeTakeFirst();
  if (!r) throw new HttpError(409, "NOT_FOUND_OR_ALREADY_REVOKED");
  await audit(db, { action: "certificate.revoked", userId: adminId, entityType: "certificate", entityId: r.id, ip: meta.ip, details: { code, reason } });
}

export async function adminUpdateUser(
  adminId: string,
  email: string,
  patch: { role?: "member" | "instructor" | "admin" | undefined; status?: "active" | "suspended" | "banned" | undefined },
) {
  const { db } = ctx();
  const user = await db.selectFrom("users").select("id").where("email", "=", email.trim().toLowerCase()).executeTakeFirst();
  if (!user) throw new HttpError(404, "NOT_FOUND");
  if (user.id === adminId) throw new HttpError(409, "CANNOT_MODIFY_SELF");
  const set = { ...(patch.role ? { role: patch.role } : {}), ...(patch.status ? { status: patch.status } : {}) };
  if (Object.keys(set).length === 0) return;
  await db.updateTable("users").set(set).where("id", "=", user.id).execute();
  // Role/status change: force re-login so no session keeps stale privileges
  await revokeAllSessions(user.id, "admin_update");
}
