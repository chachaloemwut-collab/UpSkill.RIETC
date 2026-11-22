import "server-only";
import { getCertificateArtwork } from "@upskill/db";
import { CERTIFICATE_CODE_RE } from "@upskill/core";
import { createCertificateStorage } from "@upskill/infra/storage";
import { ctx } from "../context";
import { HttpError } from "../http";
import type { CurrentUser } from "../auth/session";
import { enqueueArtworkRevision, enqueueCertificatePdf } from "../queue";

/** null = PDF still rendering (caller returns 202) */
export async function downloadCertificatePdf(user: CurrentUser, rawCode: string): Promise<{ code: string; pdf: Buffer } | null> {
  const code = rawCode.trim().toUpperCase();
  if (!CERTIFICATE_CODE_RE.test(code)) throw new HttpError(404, "NOT_FOUND");
  const { db, env } = ctx();
  const c = await db.selectFrom("certificates").select(["id", "user_id", "revoked_at", "pdf_ready_at", "course_id", "template_snapshot", "background_url_snapshot"]).where("certificate_code", "=", code).executeTakeFirst();
  // Owner or admin only (IDOR); everyone else can use the public /verify page
  if (!c || (c.user_id !== user.id && user.role !== "admin")) throw new HttpError(404, "NOT_FOUND");
  if (c.revoked_at) throw new HttpError(410, "CERTIFICATE_REVOKED");

  if (c.pdf_ready_at) {
    const [artwork, rendered] = await Promise.all([
      getCertificateArtwork(db, c),
      db.selectFrom("certificate_artwork_renders").select("revision").where("certificate_id", "=", c.id).executeTakeFirst(),
    ]);
    if (artwork.revision !== rendered?.revision) {
      await enqueueArtworkRevision(code, artwork.revision);
      return null;
    }
  }

  const pdf = await createCertificateStorage(env).read(code);
  if (!pdf) {
    await enqueueCertificatePdf(code); // jobId dedupes repeated clicks
    return null;
  }
  return { code, pdf };
}
