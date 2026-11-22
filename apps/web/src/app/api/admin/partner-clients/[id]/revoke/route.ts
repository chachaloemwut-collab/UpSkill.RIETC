import { route } from "@/server/http";
import { revokePartnerClient } from "@/server/partner/partner.service";

export const POST = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ user, params, ip }) => {
  await revokePartnerClient(user!.id, params.id, ip);
  return { ok: true };
});
