/**
 * PDPA data-subject rights: access (export) and erasure (soft-delete).
 *
 * Erasure is a soft-delete, not a hard delete: the audit log is append-only and issued
 * certificates must stay verifiable. We anonymize identifiers (email, password, unlocked
 * legal names) and drop the profile, but keep certificates, enrollments and audit rows.
 */
import "server-only";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { audit } from "../audit";
import { HttpError } from "../http";
import { revokeAllSessions, type CurrentUser } from "../auth/session";

export async function exportUserData(user: CurrentUser): Promise<Record<string, unknown>> {
  const { db } = ctx();
  const [profile, prefs, enrollments, certificates, registrations] = await Promise.all([
    db
      .selectFrom("user_profiles")
      .select([
        "title_th", "first_name_th", "last_name_th", "title_en", "first_name_en", "last_name_en",
        "phone", "birth_date", "address_line", "subdistrict", "district", "province", "postal_code",
        "national_id_last4", "pdpa_notice_version", "pdpa_consented_at",
      ])
      .where("user_id", "=", user.id)
      .executeTakeFirst(),
    db.selectFrom("email_preferences").selectAll().where("user_id", "=", user.id).executeTakeFirst(),
    db
      .selectFrom("enrollments as e")
      .innerJoin("courses as c", "c.id", "e.course_id")
      .select(["e.status", "e.completed_at", "c.title"])
      .where("e.user_id", "=", user.id)
      .orderBy("e.enrolled_at")
      .execute(),
    db.selectFrom("certificates").select(["certificate_code", "issued_at", "revoked_at"]).where("user_id", "=", user.id).orderBy("issued_at").execute(),
    db
      .selectFrom("cohort_registrations as r")
      .innerJoin("program_cohorts as c", "c.id", "r.cohort_id")
      .select(["r.status", "r.applied_at", "r.decided_at", "c.title"])
      .where("r.user_id", "=", user.id)
      .orderBy("r.applied_at")
      .execute(),
  ]);
  return {
    account: { id: user.id, email: user.email, username: user.username ?? null, role: user.role },
    profile: profile ?? null,
    emailPreferences: prefs ?? null,
    enrollments,
    certificates,
    cohortRegistrations: registrations,
    exportedAt: new Date().toISOString(),
  };
}

export async function deleteOwnAccount(user: CurrentUser, meta: { ip: string }): Promise<void> {
  const { db } = ctx();
  await db.transaction().execute(async (trx) => {
    const r = await trx
      .updateTable("users")
      .set({
        deleted_at: new Date(),
        email: sql<string>`'deleted-' || id::text || '@invalid.local'`,
        password_hash: null,
        // Keep a name that was already locked onto an issued certificate; otherwise clear it.
        legal_full_name_th: sql<string | null>`CASE WHEN legal_name_locked_at IS NULL THEN NULL ELSE legal_full_name_th END`,
        legal_full_name_en: sql<string | null>`CASE WHEN legal_name_locked_at IS NULL THEN NULL ELSE legal_full_name_en END`,
      })
      .where("id", "=", user.id)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new HttpError(409, "ALREADY_DELETED");
    await trx.deleteFrom("user_profiles").where("user_id", "=", user.id).execute();
  });
  await revokeAllSessions(user.id, "account_deleted");
  await audit(db, { action: "auth.account_deleted", userId: user.id, ip: meta.ip });
}
