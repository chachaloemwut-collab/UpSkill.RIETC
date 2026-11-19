import { HttpError, route } from "@/server/http";
import { readCertificateSignature } from "@/server/certificates/signature.service";

/** Signature printed on an issued certificate, for its owner's in-app preview (owner or admin only). */
export const GET = route<never, { code: string }>({ auth: "required" }, async ({ params, user }) => {
  const img = await readCertificateSignature(user!, params.code);
  if (!img) throw new HttpError(404, "NOT_FOUND");
  return new Response(new Uint8Array(img.bytes), { headers: { "Content-Type": img.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});
