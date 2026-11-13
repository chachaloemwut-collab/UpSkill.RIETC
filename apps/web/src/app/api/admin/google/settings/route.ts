import { z } from "zod";
import { route } from "@/server/http";
import { getGoogleOAuthSettingsView, updateGoogleOAuthSettings } from "@/server/settings/google-oauth.service";

const Body = z.strictObject({
  enabled: z.boolean(),
  clientId: z.string().trim().max(500).nullable().optional(),
  clientSecret: z.string().min(1).max(2000).nullable().optional(),
});

export const GET = route({ auth: "required", roles: ["admin"] }, async () => getGoogleOAuthSettingsView());

export const PATCH = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ body, user, ip }) => {
  await updateGoogleOAuthSettings(user!.id, body, { ip });
  return { ok: true };
});

