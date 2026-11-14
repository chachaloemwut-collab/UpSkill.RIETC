import "server-only";
import { CERTIFICATE_CODE_RE } from "@upskill/core";
import { createCertificateStorage } from "@upskill/infra/storage";
import { ctx } from "../context";
import { HttpError } from "../http";
import type { CurrentUser } from "../auth/session";
import { enqueueCertificatePdf } from "../queue";

/** null = PDF still rendering (caller returns 202) */
export async function downloadCertificatePdf(user: CurrentUser, rawCode: string): Promise<{ code: string; pdf: Buffer } | null> {
  const code = rawCode.trim().toUpperCase();
  if (!CERTIFICATE_CODE_RE.test(code)) throw new HttpError(404, "NOT_FOUND");
  const { db, env } = ctx();
  const c = await db.selectFrom("certificates").select(["user_id", "revoked_at"]).where("certificate_code", "=", code).executeTakeFirst();
  // Owner or admin only (IDOR); everyone else can use the public /verify page
  if (!c || (c.user_id !== user.id && user.role !== "admin")) throw new HttpError(404, "NOT_FOUND");
  if (c.revoked_at) throw new HttpError(410, "CERTIFICATE_REVOKED");

  const pdf = await createCertificateStorage(env).read(code);
  if (!pdf) {
    await enqueueCertificatePdf(code); // jobId dedupes repeated clicks
    return null;
  }
  return { code, pdf };
}
