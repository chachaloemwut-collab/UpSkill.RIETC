/**
 * Detailed member management for admins: searchable paginated list, full per-user detail
 * (profile, enrollments, certificates, registrations, sessions, anticheat flags, email and
 * audit history, API tokens) and account actions (role/status, revoke sessions; password tools live in
 * password.service.ts). Every mutation is audited and forces the affected user to re-login.
 */
import "server-only";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { audit } from "../audit";
import { HttpError } from "../http";
import { addEmailToOutbox } from "../email/outbox.service";
import { revokeAllSessions } from "../auth/session";

const PAGE_SIZE = 50;
const STATUS_LABELS = { active: "ใช้งาน", suspended: "ระงับชั่วคราว", banned: "ระงับถาวร" } as const;

/**
 * I-07: Lightweight user picker — search by name, primary email, secondary verified email,
 * or username. Used in assignment, group-member, cert-issuance and invitation pickers.
 * Returns at most 20 results; query must be at least 2 characters.
 */
export async function searchUsersForPicker(query: string) {
  const { db } = ctx();
  const q = query.trim();
  if (q.length < 2) return { users: [] };
  const users = await db
    .selectFrom("users as u")
    .select(["u.id", "u.email", "u.username", "u.legal_full_name_th", "u.legal_full_name_en", "u.role"])
    .where("u.status", "=", "active")
    .where("u.deleted_at", "is", null)
    .where((eb) =>
      eb.or([
        eb("u.email", "ilike", `%${q}%`),
        eb("u.username", "ilike", `%${q}%`),
        eb("u.legal_full_name_th", "ilike", `%${q}%`),
        eb("u.legal_full_name_en", "ilike", `%${q}%`),
        eb.exists(
          eb.selectFrom("user_emails as ue")
            .select("ue.id")
            .whereRef("ue.user_id", "=", "u.id")
            .where("ue.verified_at", "is not", null)
            .where("ue.email", "ilike", `%${q}%`),
        ),
      ]),
    )
    .orderBy("u.legal_full_name_th", "asc")
    .limit(20)
    .execute();
  return { users };
}

export async function listUsersAdmin(input: { query?: string; role?: string; idRecord?: string; status?: string; page: number }) {
  const { db } = ctx();
  const q = (input.query ?? "").trim();
  const page = Math.max(1, Math.floor(input.page || 1));
  const role = input.role && ["member", "instructor", "admin"].includes(input.role) ? input.role : undefined;
  const status = input.status && ["active", "suspended", "banned"].includes(input.status) ? input.status : undefined;
  // Deleted (anonymised) accounts are hidden unless asked for explicitly ("deleted")
  const deleted = input.status === "deleted";

  const total = await db
    .selectFrom("users as u")
    .leftJoin("user_profiles as idp", "idp.user_id", "u.id")
    .$if(input.idRecord === "missing", qb => qb.where("idp.user_id", "is", null))
    .$if(input.idRecord === "recorded", qb => qb.where("idp.user_id", "is not", null))
    .select(sql<number>`count(*)::int`.as("n"))
    .$if(Boolean(role), (x) => x.where("u.role", "=", role!))
    .$if(Boolean(status), (x) => x.where("u.status", "=", status!))
    .where("u.deleted_at", deleted ? "is not" : "is", null)
    .$if(Boolean(q), (x) =>
      x.where((eb) =>
        eb.or([
          eb("u.email", "ilike", `%${q}%`),
          eb("u.username", "ilike", `%${q}%`),
          eb("u.legal_full_name_th", "ilike", `%${q}%`),
          eb("u.legal_full_name_en", "ilike", `%${q}%`),
        ]),
      ),
    )
    .executeTakeFirstOrThrow();

  const users = await db
    .selectFrom("users as u")
    .leftJoin("user_profiles as idp", "idp.user_id", "u.id")
    .$if(input.idRecord === "missing", qb => qb.where("idp.user_id", "is", null))
    .$if(input.idRecord === "recorded", qb => qb.where("idp.user_id", "is not", null))
    .select([
      sql<boolean>`idp.user_id is not null`.as("has_id_record"),
      "u.id", "u.email", "u.username", "u.role", "u.status", "u.deleted_at", "u.created_at",
      "u.legal_full_name_th", "u.legal_full_name_en", "u.legal_name_locked_at", "u.is_system_owner",
      sql<number>`(select count(*)::int from enrollments e where e.user_id = u.id)`.as("enrollments"),
      sql<number>`(select count(*)::int from certificates c where c.user_id = u.id)`.as("certificates"),
      sql<string | null>`(select to_char(max(last_seen_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from user_sessions s where s.user_id = u.id)`.as("last_active_at"),
    ])
    .$if(Boolean(role), (x) => x.where("u.role", "=", role!))
    .$if(Boolean(status), (x) => x.where("u.status", "=", status!))
    .where("u.deleted_at", deleted ? "is not" : "is", null)
    .$if(Boolean(q), (x) =>
      x.where((eb) =>
        eb.or([
          eb("u.email", "ilike", `%${q}%`),
          eb("u.username", "ilike", `%${q}%`),
          eb("u.legal_full_name_th", "ilike", `%${q}%`),
          eb("u.legal_full_name_en", "ilike", `%${q}%`),
        ]),
      ),
    )
    .orderBy("u.created_at", "desc")
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)
    .execute();

  return { users, total: total.n, page, pageSize: PAGE_SIZE };
}

/**
 * All users matching the same filters as the list (for CSV export). Fetches in chunks
 * of 1000 rows so an export stays bounded even with a large member base.
 */
export async function exportUsersAdmin(input: { query?: string; role?: string; idRecord?: string; status?: string }) {
  const { db } = ctx();
  const q = (input.query ?? "").trim();
  const role = input.role && ["member", "instructor", "admin"].includes(input.role) ? input.role : undefined;
  const status = input.status && ["active", "suspended", "banned"].includes(input.status) ? input.status : undefined;

  const CHUNK = 1000;
  const rows: {
    email: string; username: string | null; role: string; status: string; deleted_at: Date | null;
    legal_full_name_th: string | null; legal_full_name_en: string | null; created_at: Date; email_verified_at: Date | null;
    enrollments: number; certificates: number; last_active_at: string | null;
  }[] = [];
  for (let offset = 0; ; offset += CHUNK) {
    const chunk = await db
      .selectFrom("users as u")
      .leftJoin("user_profiles as idp", "idp.user_id", "u.id")
      .$if(input.idRecord === "missing", qb => qb.where("idp.user_id", "is", null))
      .$if(input.idRecord === "recorded", qb => qb.where("idp.user_id", "is not", null))
      .select([
        "u.email", "u.username", "u.role", "u.status", "u.deleted_at",
        "u.legal_full_name_th", "u.legal_full_name_en", "u.created_at", "u.email_verified_at",
        sql<number>`(select count(*)::int from enrollments e where e.user_id = u.id)`.as("enrollments"),
        sql<number>`(select count(*)::int from certificates c where c.user_id = u.id)`.as("certificates"),
        sql<string | null>`(select to_char(max(last_seen_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from user_sessions s where s.user_id = u.id)`.as("last_active_at"),
      ])
      .$if(Boolean(role), (x) => x.where("u.role", "=", role!))
      .$if(Boolean(status), (x) => x.where("u.status", "=", status!))
      .$if(Boolean(q), (x) =>
        x.where((eb) =>
          eb.or([
            eb("u.email", "ilike", `%${q}%`),
            eb("u.username", "ilike", `%${q}%`),
            eb("u.legal_full_name_th", "ilike", `%${q}%`),
            eb("u.legal_full_name_en", "ilike", `%${q}%`),
          ]),
        ),
      )
      .orderBy("u.created_at", "desc")
      .limit(CHUNK)
      .offset(offset)
      .execute();
    rows.push(...chunk);
    if (chunk.length < CHUNK) break;
  }
  return rows;
}

export async function getUserDetailAdmin(userId: string) {
  const { db } = ctx();
  const [user, profile, prefs, enrollments, certificates, registrations, sessions, flags, emails, auditLog, tokens, linkedEmails] = await Promise.all([
    db
      .selectFrom("users")
      .select([
        "id", "email", "username", "role", "status", "deleted_at", "created_at", "updated_at",
        "email_verified_at", "is_system_owner", "legal_full_name_th", "legal_full_name_en", "legal_name_locked_at",
        "must_change_password", "password_updated_at",
        sql<boolean>`password_hash is not null`.as("has_password"),
      ])
      .where("id", "=", userId)
      .executeTakeFirst(),
    db
      .selectFrom("user_profiles")
      .select([
        "title_th", "first_name_th", "last_name_th", "title_en", "first_name_en", "last_name_en", "phone",
        "birth_date", "address_line", "subdistrict", "district", "province", "postal_code", "national_id_last4",
        "guardian_name", "guardian_phone", "guardian_consented_at", "pdpa_notice_version", "pdpa_consented_at",
      ])
      .where("user_id", "=", userId)
      .executeTakeFirst(),
    db.selectFrom("email_preferences").selectAll().where("user_id", "=", userId).executeTakeFirst(),
    db
      .selectFrom("enrollments as e")
      .innerJoin("courses as c", "c.id", "e.course_id")
      .select([
        "e.id", "e.status", "e.enrolled_at", "e.completed_at", "c.id as course_id", "c.slug", "c.title",
        sql<number>`(select coalesce(sum(accumulated_valid_sec), 0)::int from lesson_progress p where p.enrollment_id = e.id)`.as("study_sec"),
        sql<number>`(select count(*)::int from lesson_progress p where p.enrollment_id = e.id and p.is_completed)`.as("lessons_done"),
        sql<number>`(select count(*)::int from lessons l where l.course_id = c.id)`.as("lessons_total"),
      ])
      .where("e.user_id", "=", userId)
      .orderBy("e.enrolled_at", "desc")
      .execute(),
    db
      .selectFrom("certificates")
      .select(["enrollment_id", "certificate_code", "document_name_snapshot", "course_title_snapshot", "issued_at", "revoked_at", "revoked_reason", "expires_at"])
      .where("user_id", "=", userId)
      .orderBy("issued_at", "desc")
      .execute(),
    db
      .selectFrom("cohort_registrations as r")
      .innerJoin("program_cohorts as c", "c.id", "r.cohort_id")
      .innerJoin("programs as p", "p.id", "c.program_id")
      .select(["r.id", "r.status", "r.applied_at", "r.decided_at", "c.id as cohort_id", "c.title as cohort_title", "p.title as program_title"])
      .where("r.user_id", "=", userId)
      .orderBy("r.applied_at", "desc")
      .execute(),
    db
      .selectFrom("user_sessions")
      .select(["id", "created_at", "last_seen_at", "revoked_at", "revoked_reason"])
      .select(sql<boolean>`least(expires_at, idle_expires_at) <= now()`.as("expired"))
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .limit(20)
      .execute(),
    db
      .selectFrom("anticheat_events as a")
      .innerJoin("lessons as l", "l.id", "a.lesson_id")
      .select(["a.id", "a.reason", "a.details", "a.created_at", "l.title as lesson_title"])
      .where("a.user_id", "=", userId)
      .orderBy("a.created_at", "desc")
      .limit(20)
      .execute(),
    db
      .selectFrom("email_outbox")
      .select(["id", "template_key", "status", "created_at", "sent_at", "attempt_count", "last_error_code"])
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .limit(20)
      .execute(),
    db
      .selectFrom("audit_logs")
      .select(["id", "action", "entity_type", "entity_id", "ip_address", "details", "created_at"])
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .limit(30)
      .execute(),
    db.selectFrom("user_api_tokens").select(["id", "name", "last_used_at", "created_at", "revoked_at"]).where("user_id", "=", userId).orderBy("created_at", "desc").execute(),
    db
      .selectFrom("user_emails")
      .select(["id", "email", "is_primary", "verified_at", "created_at"])
      .where("user_id", "=", userId)
      .orderBy("is_primary", "desc")
      .orderBy("created_at", "asc")
      .execute(),
  ]);
  if (!user) throw new HttpError(404, "NOT_FOUND");
  return { user, profile, prefs, enrollments, certificates, registrations, sessions, flags, emails, auditLog, tokens, linkedEmails };
}

export async function adminUpdateUserById(
  adminId: string,
  userId: string,
  patch: { role?: "member" | "instructor" | "admin" | undefined; status?: "active" | "suspended" | "banned" | undefined },
  meta: { ip: string },
) {
  const { db } = ctx();
  const user = await db.selectFrom("users").select(["id", "email", "status", "role", "is_system_owner"]).where("id", "=", userId).executeTakeFirst();
  if (!user) throw new HttpError(404, "NOT_FOUND");
  if (user.id === adminId) throw new HttpError(409, "CANNOT_MODIFY_SELF");
  if (user.is_system_owner) throw new HttpError(409, "SYSTEM_OWNER_PROTECTED");
  // Guardrail: the last remaining active admin cannot be demoted or disabled (prevents lockout)
  if (user.role === "admin" && (patch.role !== undefined && patch.role !== "admin" || patch.status !== undefined && patch.status !== "active")) {
    const others = await db
      .selectFrom("users")
      .select(sql<number>`count(*)::int`.as("n"))
      .where("role", "=", "admin")
      .where("status", "=", "active")
      .where("deleted_at", "is", null)
      .where("id", "!=", user.id)
      .executeTakeFirstOrThrow();
    if (others.n === 0) throw new HttpError(409, "LAST_ADMIN");
  }
  const set = { ...(patch.role ? { role: patch.role } : {}), ...(patch.status ? { status: patch.status } : {}) };
  if (Object.keys(set).length === 0) return;
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("users").set(set).where("id", "=", user.id).execute();
    if (patch.status && patch.status !== user.status) {
      await addEmailToOutbox(
        trx,
        { template: "account-status-changed", to: user.email, statusLabel: STATUS_LABELS[patch.status] },
        { userId: user.id, deduplicationKey: `account-status:${user.id}:${patch.status}:${new Date().toISOString()}` },
      );
    }
  });
  await revokeAllSessions(user.id, "admin_update");
  await audit(db, { action: "user.admin_updated", userId: adminId, entityType: "user", entityId: user.id, ip: meta.ip, details: { role: patch.role, status: patch.status } });
}

export async function adminRevokeUserSessions(adminId: string, userId: string, meta: { ip: string }) {
  const user = await ctx().db.selectFrom("users").select(["id", "is_system_owner"]).where("id", "=", userId).executeTakeFirst();
  if (!user) throw new HttpError(404, "NOT_FOUND");
  if (user.id === adminId || user.is_system_owner) throw new HttpError(409, "FORBIDDEN");
  await revokeAllSessions(user.id, "admin_revoke");
  await audit(ctx().db, { action: "user.sessions_revoked", userId: adminId, entityType: "user", entityId: user.id, ip: meta.ip });
}

/** Manual email verification: for accounts the admin created offline or when outbound email is not yet configured. */
export async function adminVerifyEmail(adminId: string, userId: string, meta: { ip: string }) {
  const { db } = ctx();
  const user = await db.selectFrom("users").select(["id", "email_verified_at"]).where("id", "=", userId).executeTakeFirst();
  if (!user) throw new HttpError(404, "NOT_FOUND");
  if (user.email_verified_at) return;
  await db.updateTable("users").set({ email_verified_at: new Date() }).where("id", "=", userId).execute();
  await audit(db, { action: "user.admin_updated", userId: adminId, entityType: "user", entityId: userId, ip: meta.ip, details: { emailVerifiedManually: true } });
}

/**
 * Unlock locked legal name so the user can correct typos in their name on their profile.
 * Audited: unlocking allows the user to re-save their legal name before re-issuing certificates.
 */
export async function adminUnlockLegalName(adminId: string, userId: string, meta: { ip: string }) {
  const { db } = ctx();
  const user = await db.selectFrom("users").select(["id", "legal_name_locked_at"]).where("id", "=", userId).executeTakeFirst();
  if (!user) throw new HttpError(404, "NOT_FOUND");
  if (!user.legal_name_locked_at) return;
  await db.updateTable("users").set({ legal_name_locked_at: null }).where("id", "=", userId).execute();
  await audit(db, { action: "user.legal_name_unlocked", userId: adminId, entityType: "user", entityId: userId, ip: meta.ip });
}

/** Admin directly updates legal names for official records */
export async function adminUpdateLegalName(
  adminId: string,
  userId: string,
  names: { th?: string | null | undefined; en?: string | null | undefined },
  meta: { ip: string },
) {
  const { db } = ctx();
  const user = await db.selectFrom("users").select(["id", "legal_full_name_th", "legal_full_name_en"]).where("id", "=", userId).executeTakeFirst();
  if (!user) throw new HttpError(404, "NOT_FOUND");
  const patch: { legal_full_name_th?: string | null; legal_full_name_en?: string | null } = {};
  if (names.th !== undefined) patch.legal_full_name_th = names.th?.trim() || null;
  if (names.en !== undefined) patch.legal_full_name_en = names.en?.trim() || null;
  if (Object.keys(patch).length === 0) return;

  await db.updateTable("users").set(patch).where("id", "=", userId).execute();
  await audit(db, {
    action: "user.admin_updated",
    userId: adminId,
    entityType: "user",
    entityId: userId,
    ip: meta.ip,
    details: { legalNamesUpdated: true, ...patch },
  });
}

/**
 * Admin override for course enrollment completion:
 * Allows manually graduating a student (e.g. for credit transfer or offline workshop completion)
 * or resetting an enrollment back to in_progress.
 */
export async function adminSetEnrollmentStatus(
  adminId: string,
  enrollmentId: string,
  status: "completed" | "in_progress" | "revoked",
  meta: { ip: string },
) {
  const { db } = ctx();
  const enrollment = await db
    .selectFrom("enrollments")
    .select(["id", "user_id", "course_id", "status"])
    .where("id", "=", enrollmentId)
    .executeTakeFirst();
  if (!enrollment) throw new HttpError(404, "NOT_FOUND", "ไม่พบการลงทะเบียนเรียนนี้");

  const completedAt = status === "completed" ? new Date() : null;
  await db
    .updateTable("enrollments")
    .set({ status, completed_at: completedAt })
    .where("id", "=", enrollmentId)
    .execute();

  await audit(db, {
    action: "course.completion_overridden",
    userId: adminId,
    entityType: "course",
    entityId: enrollment.course_id,
    ip: meta.ip,
    details: { enrollmentId, targetUserId: enrollment.user_id, fromStatus: enrollment.status, toStatus: status },
  });
}
