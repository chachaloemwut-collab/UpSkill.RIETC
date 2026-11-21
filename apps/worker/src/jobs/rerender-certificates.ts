/**
 * Re-render every issued certificate's PDF once after the artwork/wording changes (CERTIFICATE_ARTWORK_VERSION).
 * Only the stored PDF is replaced: the signed record, codes and verification are untouched, no email is sent,
 * and a failed re-render keeps the previous PDF. Revoked documents are skipped (they cannot be downloaded).
 * Runs at worker start; the version is recorded in system_settings so it happens once per artwork version.
 */
import type { Queue } from "bullmq";
import type { Database, JsonValue } from "@upskill/db";
import { logger } from "@upskill/infra/logger";

/** Bump when certificate-template.ts output changes in a way issued documents should receive. */
export const CERTIFICATE_ARTWORK_VERSION = "2026-11-21-wuttibat";
const SETTING_KEY = "certificate_artwork_version";

export async function scheduleCertificateRerender(db: Database, queue: Queue): Promise<number> {
  const current = await db.selectFrom("system_settings").select("value").where("key", "=", SETTING_KEY).executeTakeFirst();
  if (current && (current.value as { version?: string }).version === CERTIFICATE_ARTWORK_VERSION) return 0;

  const rows = await db.selectFrom("certificates").select("certificate_code").where("revoked_at", "is", null).execute();
  for (const r of rows) {
    // Distinct jobId per version: never collides with (or is deduped against) a normal first render
    await queue.add("rerender", { code: r.certificate_code, rerender: true }, {
      jobId: `rerender-${CERTIFICATE_ARTWORK_VERSION}-${r.certificate_code}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    });
  }
  const value = { version: CERTIFICATE_ARTWORK_VERSION, scheduled: rows.length, at: new Date().toISOString() } as unknown as JsonValue;
  await db
    .insertInto("system_settings")
    .values({ key: SETTING_KEY, value })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value, updated_at: new Date() }))
    .execute();
  logger.info({ version: CERTIFICATE_ARTWORK_VERSION, count: rows.length }, "certificate PDFs scheduled for re-render");
  return rows.length;
}
