import "server-only";
import type { JsonValue } from "@upskill/db";
import { sql } from "@upskill/db";
import { ctx } from "./context";
import { audit } from "./audit";
import type { CurrentUser } from "./auth/session";

export type AutomationName = "assignment_reminders" | "cohort_notifications" | "waitlist_promotion";

export const AUTOMATION_LABELS: Record<AutomationName, { title: string; description: string }> = {
  assignment_reminders: { title: "เตือนกำหนดส่งงาน", description: "แจ้งผู้เรียนอัตโนมัติเมื่องานครบกำหนดภายใน 24 ชั่วโมง" },
  cohort_notifications: { title: "แจ้งเตือนรอบอบรม", description: "แจ้งผู้ที่อนุมัติแล้วก่อนรอบเริ่ม และแจ้งผู้ติดตามเมื่อเปิดรับสมัคร" },
  waitlist_promotion: { title: "เลื่อนรายชื่อสำรองอัตโนมัติ", description: "เมื่อมีที่นั่งว่าง ระบบเลื่อนผู้รอคิวโดยอัตโนมัติโดยไม่ต้องผู้ดูแลดำเนินการ" },
};

export interface AutomationFlags {
  paused: AutomationName[];
}

const FALLBACK: AutomationFlags = { paused: [] };

export async function getAutomationFlags(): Promise<AutomationFlags> {
  const row = await ctx().db.selectFrom("system_settings").select("value").where("key", "=", "automation_flags").executeTakeFirst();
  if (!row) return FALLBACK;
  const v = row.value as { paused?: unknown };
  const valid: AutomationName[] = ["assignment_reminders", "cohort_notifications", "waitlist_promotion"];
  const paused = Array.isArray(v.paused) ? v.paused.filter((x): x is AutomationName => typeof x === "string" && valid.includes(x as AutomationName)) : [];
  return { paused };
}

export async function toggleAutomation(user: CurrentUser, name: AutomationName, paused: boolean): Promise<AutomationFlags> {
  const { db } = ctx();
  const current = await getAutomationFlags();
  const next: AutomationFlags = paused
    ? { paused: [...new Set([...current.paused, name])] }
    : { paused: current.paused.filter((n) => n !== name) };
  await db
    .insertInto("system_settings")
    .values({ key: "automation_flags", value: next as unknown as JsonValue, updated_by: user.id })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: next as unknown as JsonValue, updated_at: new Date(), updated_by: user.id }))
    .execute();
  await audit(db, { action: "system.automation_toggled", userId: user.id, entityType: "system", entityId: name, ip: "internal", details: { paused, name } });
  return next;
}

export async function getAutomationBacklog() {
  const { db } = ctx();
  const [emailPending, waitlistPending, pdfFailed] = await Promise.all([
    db.selectFrom("email_outbox").select(sql<number>`count(*)::int`.as("n")).where("status", "in", ["pending", "processing"]).executeTakeFirst(),
    db.selectFrom("cohort_registrations").select(sql<number>`count(*)::int`.as("n")).where("status", "=", "waitlisted").executeTakeFirst(),
    db.selectFrom("certificates").select(sql<number>`count(*)::int`.as("n")).where("pdf_failed_at", "is not", null).executeTakeFirst(),
  ]);
  return {
    email_pending: emailPending?.n ?? 0,
    waitlist_pending: waitlistPending?.n ?? 0,
    pdf_failed: pdfFailed?.n ?? 0,
  };
}
