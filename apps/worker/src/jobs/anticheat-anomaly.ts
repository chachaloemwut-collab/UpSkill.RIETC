import { sql, type Database } from "@upskill/db";
import { enqueueAdminAlert } from "./process-email-outbox";

// How many anticheat flags in a rolling hour before we page the admins. Deliberately high:
// a few false positives are expected, but a large spike means either a coordinated cheating
// attempt or a broken check that is flagging everyone. Tune via ANTICHEAT_ALERT_THRESHOLD.
const THRESHOLD = Number(process.env.ANTICHEAT_ALERT_THRESHOLD ?? 100);

export async function checkAnticheatAnomaly(db: Database, appOrigin: string): Promise<void> {
  const { count } = await db
    .selectFrom("anticheat_events")
    .select(sql<number>`count(*)::int`.as("count"))
    .where("created_at", ">=", sql<Date>`now() - interval '60 minutes'`)
    .executeTakeFirstOrThrow();
  if (count < THRESHOLD) return;
  // Dedupe per hour so an ongoing attack yields one email per hour, not one per check.
  const hour = new Date().toISOString().slice(0, 13);
  await enqueueAdminAlert(
    db,
    "พบความผิดปกติการเรียนจำนวนมาก",
    `${count} เหตุการณ์กันโกงใน 60 นาทีล่าสุด (เกณฑ์ ${THRESHOLD}) โปรดตรวจสอบหน้า anticheat`,
    `anticheat-anomaly:${hour}`,
    appOrigin,
  );
}
