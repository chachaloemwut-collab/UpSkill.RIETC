import { sql, type Database } from "@upskill/db";

/**
 * Expire pending waitlist offers that passed their acceptance deadline.
 * When a cohort has waitlist_acceptance_hours set, applicants promoted
 * from the waitlist to "pending" must accept within that window.
 * Those who don't are moved back to "waitlisted" so the seat re-opens.
 */
export async function expireWaitlistOffers(db: Database) {
  const expired = await db
    .selectFrom("cohort_registrations as r")
    .innerJoin("program_cohorts as c", "c.id", "r.cohort_id")
    .select(["r.id", "r.cohort_id"])
    .where("r.status", "=", "pending")
    .where("r.waitlist_offer_sent_at", "is not", null)
    .where("c.waitlist_acceptance_hours", "is not", null)
    .where(
      sql<boolean>`r.waitlist_offer_sent_at + (c.waitlist_acceptance_hours * interval '1 hour') < now()`,
    )
    .execute();

  if (expired.length === 0) return { expired: 0 };

  for (const row of expired) {
    await db.transaction().execute(async (trx) => {
      const updated = await trx
        .updateTable("cohort_registrations")
        .set({ status: "waitlisted", waitlist_offer_sent_at: null })
        .where("id", "=", row.id)
        .where("status", "=", "pending")
        .executeTakeFirst();

      if (Number(updated.numUpdatedRows) === 0) return;

      // Promote the next person in the waitlist queue
      const cohort = await trx.selectFrom("program_cohorts").selectAll().where("id", "=", row.cohort_id).executeTakeFirst();
      if (!cohort || cohort.status !== "published" || new Date(cohort.ends_at) <= new Date()) return;

      // Count active seats (approved + pending)
      const taken = await trx
        .selectFrom("cohort_registrations")
        .select(sql<number>`count(*)::int`.as("n"))
        .where("cohort_id", "=", row.cohort_id)
        .where("status", "in", ["approved", "pending"])
        .executeTakeFirst();
      const takenCount = taken?.n ?? 0;
      if (cohort.capacity !== null && takenCount >= cohort.capacity) return;

      const next = await trx
        .selectFrom("cohort_registrations")
        .select(["id"])
        .where("cohort_id", "=", row.cohort_id)
        .where("status", "=", "waitlisted")
        .orderBy("applied_at")
        .limit(1)
        .executeTakeFirst();
      if (!next) return;

      await trx
        .updateTable("cohort_registrations")
        .set({ status: "pending", waitlist_offer_sent_at: new Date() })
        .where("id", "=", next.id)
        .execute();
    });
  }

  return { expired: expired.length };
}
