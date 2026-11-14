import { z } from "zod";
import { route } from "@/server/http";
import { emailPreferenceSummary, updateEmailPreferences } from "@/server/email/outbox.service";

const Body = z.strictObject({
  course_updates_enabled: z.boolean(),
  learning_reminders_enabled: z.boolean(),
  weekly_summary_enabled: z.boolean(),
  preferred_locale: z.enum(["th", "en"]),
});

export const GET = route({ auth: "required" }, async ({ user }) => emailPreferenceSummary(user!.id));

export const PATCH = route<typeof Body>({ auth: "required", body: Body }, async ({ user, body }) => {
  await updateEmailPreferences(user!.id, {
    courseUpdatesEnabled: body.course_updates_enabled,
    learningRemindersEnabled: body.learning_reminders_enabled,
    weeklySummaryEnabled: body.weekly_summary_enabled,
    preferredLocale: body.preferred_locale,
  });
  return { ok: true };
});
