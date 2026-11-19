import { z } from "zod";
import { APPLICATION_FILE_MAX_BYTES } from "@upskill/core";
import { RATE_LIMITS, hitRateLimit } from "@upskill/infra/rate-limit";
import { HttpError, route } from "@/server/http";
import { ctx } from "@/server/context";
import { uuidParam } from "@/server/params";
import { uploadApplicationFile } from "@/server/courses/applications.service";

const DocKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);

/**
 * Upload one document file for the application form: raw bytes in the body (PDF/JPG/PNG, max 5 MB),
 * ?doc=<document key>&page=<1-based page number (default 1)>, name in X-File-Name (URI-encoded).
 * Also accepts re-upload after the applicant's application is submitted if admin requested it.
 */
export const POST = route<never, { id: string }>({ auth: "required" }, async ({ req, params, user }) => {
  const courseId = uuidParam(params.id);
  const doc = DocKey.safeParse(req.nextUrl.searchParams.get("doc"));
  if (!doc.success) throw new HttpError(400, "UNKNOWN_DOCUMENT");
  const pageNo = Math.max(1, Math.min(10, Number(req.nextUrl.searchParams.get("page") ?? "1") || 1));
  const r = await hitRateLimit(ctx().redis, RATE_LIMITS.applicationUploadPerUser, user!.id);
  if (!r.allowed) throw new HttpError(429, "RATE_LIMITED", undefined, { "Retry-After": String(r.retryAfterSec) });
  // Refuse oversized uploads before reading them
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > APPLICATION_FILE_MAX_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "ไฟล์ใหญ่เกิน 5 MB");
  const bytes = new Uint8Array(await req.arrayBuffer());
  let name = "";
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") ?? "");
  } catch {
    name = "";
  }
  return uploadApplicationFile(user!, courseId, doc.data, bytes, name, pageNo);
});
