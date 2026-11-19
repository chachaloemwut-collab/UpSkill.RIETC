import { sql, type Database } from "@upskill/db";
import { emailCategory } from "@upskill/infra/mailer";

/** Picks up announcements whose scheduled_broadcast_at has passed and sends them. */
export async function processScheduledBroadcasts(db: Database, appOrigin: string) {
  const due = await db
    .selectFrom("announcements")
    .select("id")
    .where("visibility", "=", "published")
    .where("broadcast_at", "is", null)
    .where("scheduled_broadcast_at", "is not", null)
    .where("scheduled_broadcast_at", "<=", new Date())
    .execute();
  if (due.length === 0) return { processed: 0 };

  for (const { id } of due) {
    await db.transaction().execute(async (trx) => {
      const a = await trx.selectFrom("announcements").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
      if (!a || a.broadcast_at || a.visibility !== "published") return;

      const claimed = await trx.updateTable("announcements").set({ broadcast_at: new Date() }).where("id", "=", id).where("broadcast_at", "is", null).executeTakeFirst();
      if (Number(claimed.numUpdatedRows) === 0) return;

      let recipientsQ = trx
        .selectFrom("users as u")
        .leftJoin("email_preferences as ep", "ep.user_id", "u.id")
        .select(["u.id", "u.email", "ep.preferred_locale"])
        .where("u.status", "=", "active")
        .where("u.email_verified_at", "is not", null)
        .where("u.is_system_owner", "=", false)
        .where(sql<boolean>`coalesce(ep.course_updates_enabled, true)`);

      if (a.cohort_id) {
        recipientsQ = recipientsQ.where((eb) =>
          eb.exists(
            eb.selectFrom("cohort_registrations as cr")
              .select("cr.id")
              .where("cr.cohort_id", "=", a.cohort_id!)
              .where("cr.status", "=", "approved")
              .whereRef("cr.user_id", "=", "u.id"),
          ),
        );
      }

      const recipients = await recipientsQ.execute();
      const link = `${appOrigin}/announcements/${a.slug}`;
      const summary = a.summary ?? a.body.slice(0, 300);
      const category = emailCategory("announcement");

      for (let i = 0; i < recipients.length; i += 500) {
        const chunk = recipients.slice(i, i + 500);
        await trx
          .insertInto("email_outbox")
          .values(
            chunk.map((r) => ({
              user_id: r.id,
              recipient_email: r.email.trim().toLowerCase(),
              template_key: "announcement",
              template_version: 1,
              payload: JSON.stringify({
                title: a.title,
                summary,
                link,
                locale: r.preferred_locale === "en" ? "en" : "th",
              }),
              deduplication_key: `announcement:${id}:${r.id}`,
              category,
            })),
          )
          .onConflict((oc) => oc.column("deduplication_key").doNothing())
          .execute();
      }
    });
  }
  return { processed: due.length };
}
