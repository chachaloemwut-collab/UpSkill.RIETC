import { sql, type Database, type JsonValue, type Tx } from "@upskill/db";
import { emailCategory, type EmailJob } from "@upskill/infra/mailer";
import { isAutomationPaused } from "./automation-flags.ts";

type Sender = (job: EmailJob) => Promise<{ messageId: string | null }>;
type SenderProvider = () => Promise<Sender | null>;

function jobFromRow(row: { template_key: string; recipient_email: string; payload: JsonValue }): EmailJob {
  return { template: row.template_key, to: row.recipient_email, ...(row.payload as object) } as EmailJob;
}

export async function addWorkerEmail(
  db: Database | Tx,
  job: EmailJob,
  options: { deduplicationKey: string; userId?: string | null; nextAttemptAt?: Date },
) {
  const preference = options.userId && !job.locale
    ? await db.selectFrom("email_preferences").select("preferred_locale").where("user_id", "=", options.userId).executeTakeFirst()
    : null;
  const localized = { ...job, locale: job.locale ?? (preference?.preferred_locale === "en" ? "en" : "th") } as EmailJob;
  const { template, to, ...payload } = localized;
  await db
    .insertInto("email_outbox")
    .values({
      user_id: options.userId ?? null,
      recipient_email: to.trim().toLowerCase(),
      template_key: template,
      template_version: 1,
      payload: payload as JsonValue,
      deduplication_key: options.deduplicationKey,
      category: emailCategory(template),
      ...(options.nextAttemptAt ? { next_attempt_at: options.nextAttemptAt } : {}),
    })
    .onConflict((oc) => oc.column("deduplication_key").doNothing())
    .execute();
}

async function shouldSuppress(db: Database, row: { user_id: string | null; recipient_email: string; category: string; template_key: string }) {
  const suppressed = await db.selectFrom("email_suppressions").select("email").where("email", "=", row.recipient_email).executeTakeFirst();
  if (suppressed) return true;
  if (!row.user_id || (row.category !== "course_update" && row.category !== "learning_reminder")) return false;
  const prefs = await db.selectFrom("email_preferences").selectAll().where("user_id", "=", row.user_id).executeTakeFirst();
  if (row.category === "course_update") return prefs?.course_updates_enabled === false;
  if (row.template_key === "weekly-summary") return prefs?.weekly_summary_enabled !== true;
  return prefs?.learning_reminders_enabled === false;
}

export async function processEmailOutbox(db: Database, getSender: SenderProvider, appOrigin: string): Promise<number> {
  const send = await getSender();
  // Disabling outbound email pauses the queue without consuming retries.
  if (!send) return 0;
  const rows = await db.transaction().execute(async (trx) => {
    const picked = await trx
      .selectFrom("email_outbox")
      .selectAll()
      .where((eb) =>
        eb.or([
          eb.and([eb("status", "=", "pending"), eb("next_attempt_at", "<=", new Date())]),
          eb.and([eb("status", "=", "processing"), eb("claimed_at", "<", sql<Date>`now() - interval '10 minutes'`)]),
        ]),
      )
      .orderBy("created_at")
      .limit(25)
      .forUpdate()
      .skipLocked()
      .execute();
    for (const row of picked) {
      await trx.updateTable("email_outbox").set({ status: "processing", claimed_at: new Date(), attempt_count: row.attempt_count + 1 }).where("id", "=", row.id).execute();
    }
    return picked.map((row) => ({ ...row, attempt_count: row.attempt_count + 1 }));
  });

  for (const row of rows) {
    let documentSuppressed = false;
    if (row.template_key === "reset-password" || row.template_key === "verify-email") {
      const tokenId = row.deduplication_key.split(":")[1];
      if (row.user_id && tokenId && /^[0-9a-f-]{36}$/i.test(tokenId)) {
        const table = row.template_key === "reset-password" ? "password_reset_tokens" : "email_verification_tokens";
        const valid = await db.selectFrom(table).select("id")
          .where("id", "=", tokenId).where("user_id", "=", row.user_id)
          .where("used_at", "is", null).where("expires_at", ">", new Date()).executeTakeFirst();
        documentSuppressed = !valid;
      }
    }
    if (row.template_key === "credential-ready" || row.template_key === "membership-confirmed") {
      const recipient = row.user_id && await db.selectFrom("users").select("id").where("id","=",row.user_id).where("email","=",row.recipient_email).where("email_verified_at","is not",null).where("deleted_at","is",null).executeTakeFirst();
      documentSuppressed = !recipient;
      const job = jobFromRow(row);
      if (recipient && job.template === "credential-ready") {
        documentSuppressed = !await db.selectFrom("certificates").select("id").where("certificate_code","=",job.code).where("user_id","=",recipient.id).where("revoked_at","is",null).executeTakeFirst();
      }
    }
    if (documentSuppressed || await shouldSuppress(db, row)) {
      await db.updateTable("email_outbox").set({ status: "suppressed", claimed_at: null }).where("id", "=", row.id).execute();
      continue;
    }
    try {
      const result = await send(jobFromRow(row));
      const now = new Date();
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("email_outbox")
          .set({ status: "sent", sent_at: now, claimed_at: null, provider_message_id: result.messageId, last_error_code: null, last_error_message: null })
          .where("id", "=", row.id)
          .execute();
        await trx
          .insertInto("email_delivery_events")
          .values({ outbox_id: row.id, provider_message_id: result.messageId, event_type: "sent", occurred_at: now, payload: {} })
          .execute();
      });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code).slice(0, 100) : "SEND_FAILED";
      const message = error instanceof Error ? error.message.slice(0, 1000) : "email send failed";
      const final = row.attempt_count >= 5;
      const delayMinutes = Math.min(60, 2 ** row.attempt_count);
      await db
        .updateTable("email_outbox")
        .set({
          status: final ? "failed" : "pending",
          claimed_at: null,
          last_error_code: code,
          last_error_message: message,
          ...(final ? { failed_at: new Date() } : { next_attempt_at: new Date(Date.now() + delayMinutes * 60_000) }),
        })
        .where("id", "=", row.id)
        .execute();
      if (final && row.template_key !== "system-alert") {
        await enqueueAdminAlert(db, "ส่งอีเมลไม่สำเร็จ", `รายการ ${row.id} ประเภท ${row.template_key} ล้มเหลวหลังลอง ${row.attempt_count} ครั้ง`, `email-failed:${row.id}`, appOrigin);
      }
    }
  }
  return rows.length;
}

export async function enqueueAssignmentReminders(db: Database, appOrigin: string) {
  if (await isAutomationPaused(db, "assignment_reminders")) return;
  const rows = await db
    .selectFrom("course_assignment_recipients as r")
    .innerJoin("course_assignments as a", "a.id", "r.assignment_id")
    .innerJoin("enrollments as e", "e.id", "r.enrollment_id")
    .innerJoin("courses as c", "c.id", "a.course_id")
    .innerJoin("users as u", "u.id", "r.user_id")
    .select(["a.id as assignment_id", "a.due_at", "c.title", "c.slug", "u.id as user_id", "u.email"])
    .where("a.status", "=", "active")
    .where("r.cancelled_at", "is", null)
    .where("e.status", "=", "in_progress")
    .where("a.due_at", ">", new Date())
    .where("a.due_at", "<=", sql<Date>`now() + interval '24 hours'`)
    .execute();
  for (const row of rows) {
    const dueAt = new Date(row.due_at!).toISOString();
    await addWorkerEmail(
      db,
      { template: "assignment-due-reminder", to: row.email, courseTitle: row.title, courseLink: `${appOrigin}/courses/${row.slug}`, dueAt },
      { userId: row.user_id, deduplicationKey: `assignment-due:${row.assignment_id}:${row.user_id}:${dueAt}` },
    );
  }
}

export async function enqueueWeeklySummaries(db: Database, appOrigin: string) {
  const users = await db
    .selectFrom("email_preferences as p")
    .innerJoin("users as u", "u.id", "p.user_id")
    .select([
      "u.id",
      "u.email",
      sql<number>`(select count(*)::int from enrollments e where e.user_id = u.id and e.status = 'in_progress')`.as("in_progress"),
      sql<number>`(select count(*)::int from enrollments e where e.user_id = u.id and e.status = 'completed')`.as("completed"),
    ])
    .where("p.weekly_summary_enabled", "=", true)
    .where("u.status", "=", "active")
    .execute();
  const week = new Date().toISOString().slice(0, 10);
  for (const user of users) {
    await addWorkerEmail(
      db,
      { template: "weekly-summary", to: user.email, inProgress: user.in_progress, completed: user.completed, dashboardLink: `${appOrigin}/my-courses` },
      { userId: user.id, deduplicationKey: `weekly-summary:${user.id}:${week}` },
    );
  }
}

export async function enqueueAdminAlert(db: Database, title: string, details: string, deduplicationKey: string, appOrigin: string) {
  const admins = await db.selectFrom("users").select(["id", "email"]).where("role", "=", "admin").where("status", "=", "active").execute();
  for (const admin of admins) {
    await addWorkerEmail(
      db,
      { template: "system-alert", to: admin.email, title, details, manageLink: `${appOrigin}/admin` },
      { userId: admin.id, deduplicationKey: `${deduplicationKey}:${admin.id}` },
    );
  }
}
