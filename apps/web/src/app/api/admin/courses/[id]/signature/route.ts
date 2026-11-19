import { HttpError, route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { SIGNATURE_MAX_BYTES, readCourseSignature, removeCourseSignature, uploadCourseSignature } from "@/server/certificates/signature.service";

/** The course's current signature image (admin preview). */
export const GET = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params }) => {
  const img = await readCourseSignature(uuidParam(params.id));
  if (!img) throw new HttpError(404, "NOT_FOUND");
  return new Response(new Uint8Array(img.bytes), { headers: { "Content-Type": img.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});

/** Upload the signature: raw PNG/JPG bytes in the body, max 1 MB. */
export const POST = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ req, params, user, ip }) => {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > SIGNATURE_MAX_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "ไฟล์ลายเซ็นต้องไม่เกิน 1 MB");
  const bytes = new Uint8Array(await req.arrayBuffer());
  return uploadCourseSignature(user!, uuidParam(params.id), bytes, { ip });
});

export const DELETE = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user, ip }) =>
  removeCourseSignature(user!, uuidParam(params.id), { ip }),
);
