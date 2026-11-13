import { z } from "zod";
import { route } from "@/server/http";
import { revokeCertificate } from "@/server/admin/admin.service";

const Body = z.strictObject({ reason: z.string().trim().min(5).max(1000) });

export const POST = route<typeof Body, { code: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, body, user, ip }) => {
  await revokeCertificate(user!.id, params.code, body.reason, { ip });
  return { ok: true };
});
