import "server-only";
import type { JsonValue } from "@upskill/db";
import { ctx } from "./context";
import { audit } from "./audit";
import type { CurrentUser } from "./auth/session";
import { parseCertificateDisplay, type CertificateDisplay } from "@upskill/core/certificate-patterns";

export interface CourseDefaults {
  min_watch_percentage: number;
  passing_quiz_score: number;
  max_quiz_attempts_per_day: number;
  quiz_time_limit_min: number;
  is_sequential_locked: boolean;
  navigation_mode: string;
  completion_rule: string;
}

// Must match the courses column defaults (0001_init, 0024) so new courses keep the strict behavior
const FALLBACK: CourseDefaults = {
  min_watch_percentage: 90,
  passing_quiz_score: 80,
  max_quiz_attempts_per_day: 3,
  quiz_time_limit_min: 30,
  is_sequential_locked: true,
  navigation_mode: "linear",
  completion_rule: "post_test",
};

export async function getCourseDefaults(): Promise<CourseDefaults> {
  const row = await ctx().db.selectFrom("system_settings").select("value").where("key", "=", "course_defaults").executeTakeFirst();
  if (!row) return FALLBACK;
  return { ...FALLBACK, ...(row.value as Partial<CourseDefaults>) };
}

export async function updateCourseDefaults(user: CurrentUser, patch: Partial<CourseDefaults>) {
  const { db } = ctx();
  const current = await getCourseDefaults();
  const next = { ...current, ...patch };
  await db
    .insertInto("system_settings")
    .values({ key: "course_defaults", value: next as unknown as JsonValue, updated_by: user.id })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: next as unknown as JsonValue, updated_at: new Date(), updated_by: user.id }))
    .execute();
  await audit(db, { action: "system.course_defaults_updated", userId: user.id, entityType: "system", entityId: "course_defaults", ip: "internal", details: patch });
  return next;
}

/** Site-wide certificate layout (signature block, issuing body). Read by the worker when it renders a PDF. */
export async function getCertificateDisplay(): Promise<CertificateDisplay> {
  const row = await ctx().db.selectFrom("system_settings").select("value").where("key", "=", "certificate_display").executeTakeFirst();
  return parseCertificateDisplay(row?.value);
}

export async function updateCertificateDisplay(user: CurrentUser, patch: Partial<CertificateDisplay>) {
  const { db } = ctx();
  const next = parseCertificateDisplay({ ...(await getCertificateDisplay()), ...patch });
  await db
    .insertInto("system_settings")
    .values({ key: "certificate_display", value: next as unknown as JsonValue, updated_by: user.id })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: next as unknown as JsonValue, updated_at: new Date(), updated_by: user.id }))
    .execute();
  await audit(db, { action: "system.certificate_display_updated", userId: user.id, entityType: "system", entityId: "certificate_display", ip: "internal", details: patch });
  return next;
}
