import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { deletePendingApplicationFile, readApplicationFile } from "@/server/courses/applications.service";

type P = { id: string; fileId: string };

/** Download an application document: the applicant or a manager of the course only. */
export const GET = route<never, P>({ auth: "required" }, async ({ params, user }) => {
  const f = await readApplicationFile(user!, uuidParam(params.id), uuidParam(params.fileId));
  return new Response(new Uint8Array(f.bytes), {
    headers: {
      "content-type": f.contentType,
      // Always a download (never rendered as part of our origin), with a UTF-8 file name
      "content-disposition": `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
});

/** Remove a file that has not been submitted yet. */
export const DELETE = route<never, P>({ auth: "required" }, async ({ params, user }) => {
  await deletePendingApplicationFile(user!, uuidParam(params.id), uuidParam(params.fileId));
  return { ok: true };
});
