import { z } from "zod";
import { route } from "@/server/http";
import { createPartnerClient, listPartnerClients } from "@/server/partner/partner.service";

export const GET = route({ auth: "required", roles: ["admin"] }, async () => ({ clients: await listPartnerClients() }));

const Body = z.strictObject({
  name: z.string().trim().min(3).max(200),
  purpose: z.string().trim().min(10).max(2000),
  allowedIps: z.array(z.string().max(64)).min(1).max(50),
  days: z.number().int().min(1).max(365),
});

// The key is in this response only; it cannot be shown again
export const POST = route({ auth: "required", roles: ["admin"], body: Body }, async ({ user, body, ip }) => {
  const created = await createPartnerClient(user!.id, body, ip);
  return { ok: true, ...created };
});
