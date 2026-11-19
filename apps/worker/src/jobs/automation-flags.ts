import type { Database } from "@upskill/db";

/** Returns true if the named automation is paused in system_settings. */
export async function isAutomationPaused(db: Database, name: string): Promise<boolean> {
  const row = await db.selectFrom("system_settings").select("value").where("key", "=", "automation_flags").executeTakeFirst();
  if (!row) return false;
  const flags = row.value as { paused?: unknown };
  return Array.isArray(flags.paused) && flags.paused.includes(name);
}
