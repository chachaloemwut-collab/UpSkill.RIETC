import { z } from "zod";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { requestDocumentReupload } from "@/server/courses/applications.service";

type P = { id: string; applicationId: string };
const Body = z.strictObject({ docKey: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/) });

/** Request the applicant to re-upload a specific document (I-10). */
export const POST = route<typeof Body, P>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user, ip }) => {
  await requestDocumentReupload(user!, uuidParam(params.id), uuidParam(params.applicationId), body.docKey, { ip });
  return { ok: true };
});
