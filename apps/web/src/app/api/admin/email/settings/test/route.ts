import { z } from "zod";
import { route } from "@/server/http";
import { testEmailSettings } from "@/server/admin/email-settings.service";

const Body = z.strictObject({ recipient: z.email().max(254) });

export const POST = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ body, user, ip }) => {
  await testEmailSettings(user!.id, body.recipient, { ip });
  return { ok: true };
});

