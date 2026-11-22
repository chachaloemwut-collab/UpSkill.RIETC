import { createHash } from "node:crypto";
import type { Database } from "./index.ts";

export const CERTIFICATE_ARTWORK_VERSION = "2026-11-institutional-marks";
type Source = { course_id: string | null; template_snapshot: string; background_url_snapshot: string | null };

/** Course design may change after issue. All personal and achievement data comes from the signed record. */
export async function getCertificateArtwork(db: Database, record: Source) {
  const course = record.course_id
    ? await db.selectFrom("courses").select(["credential_template_key", "credential_background_url"]).where("id", "=", record.course_id).executeTakeFirst()
    : undefined;
  const template = course?.credential_template_key ?? record.template_snapshot;
  const backgroundUrl = course ? course.credential_background_url : record.background_url_snapshot;
  const revision = createHash("sha256").update(JSON.stringify([CERTIFICATE_ARTWORK_VERSION, template, backgroundUrl])).digest("hex");
  return { template, backgroundUrl, revision };
}
