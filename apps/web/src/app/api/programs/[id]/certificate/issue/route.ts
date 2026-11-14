import { route } from "@/server/http";
import { issueProgramCertificate } from "@/server/certificates/issue.service";
import { uuidParam } from "@/server/params";

export const POST = route<never, { id: string }>({ auth: "required" }, async ({ params, user, ip }) => {
  const result = await issueProgramCertificate({ userId: user!.id, programId: uuidParam(params.id), ip });
  return { ok: true, ...result };
});
