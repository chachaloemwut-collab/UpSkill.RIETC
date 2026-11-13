import "server-only";
import type { Database, Tx } from "@upskill/db";
import type { JsonValue } from "@upskill/db";
import { emailCategory, type EmailJob } from "@upskill/infra/mailer";

type Executor = Database | Tx;

export async function addEmailToOutbox(
  db: Executor,
  job: EmailJob,
  options: { deduplicationKey: string; userId?: string | null; nextAttemptAt?: Date },
): Promise<string | null> {
  const preference = options.userId && !job.locale
    ? await db.selectFrom("email_preferences").select("preferred_locale").where("user_id", "=", options.userId).executeTakeFirst()
    : null;
  const localized = { ...job, locale: job.locale ?? (preference?.preferred_locale === "en" ? "en" : "th") } as EmailJob;
  const { template, to, ...payload } = localized;
  const row = await db
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
    .returning("id")
    .executeTakeFirst();
  return row?.id ?? null;
}

export async function emailPreferenceSummary(userId: string) {
  const { ctx } = await import("../context");
  const row = await ctx().db.selectFrom("email_preferences").selectAll().where("user_id", "=", userId).executeTakeFirst();
  return {
    courseUpdatesEnabled: row?.course_updates_enabled ?? true,
    learningRemindersEnabled: row?.learning_reminders_enabled ?? true,
    weeklySummaryEnabled: row?.weekly_summary_enabled ?? false,
    preferredLocale: row?.preferred_locale === "en" ? "en" as const : "th" as const,
  };
}

export async function updateEmailPreferences(
  userId: string,
  input: { courseUpdatesEnabled: boolean; learningRemindersEnabled: boolean; weeklySummaryEnabled: boolean; preferredLocale: "th" | "en" },
) {
  const { ctx } = await import("../context");
  await ctx()
    .db.insertInto("email_preferences")
    .values({
      user_id: userId,
      course_updates_enabled: input.courseUpdatesEnabled,
      learning_reminders_enabled: input.learningRemindersEnabled,
      weekly_summary_enabled: input.weeklySummaryEnabled,
      preferred_locale: input.preferredLocale,
    })
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet({
        course_updates_enabled: input.courseUpdatesEnabled,
        learning_reminders_enabled: input.learningRemindersEnabled,
        weekly_summary_enabled: input.weeklySummaryEnabled,
        preferred_locale: input.preferredLocale,
      }),
    )
    .execute();
}
