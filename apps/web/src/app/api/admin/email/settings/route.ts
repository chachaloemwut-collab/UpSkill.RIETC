import { z } from "zod";
import { route } from "@/server/http";
import { getEmailSettingsView, updateEmailSettings } from "@/server/admin/email-settings.service";

const Body = z.strictObject({
  enabled: z.boolean(),
  senderName: z.string().trim().min(1).max(255),
  senderEmail: z.email().max(254),
  replyToEmail: z.union([z.email().max(254), z.literal(""), z.null()]).optional(),
  smtpHost: z.string().trim().min(1).max(255).regex(/^[a-z0-9.-]+$/i),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecurity: z.enum(["none", "starttls", "tls"]),
  smtpUsername: z.string().trim().max(255).nullable().optional(),
  smtpPassword: z.string().min(1).max(1024).nullable().optional(),
});

export const GET = route({ auth: "required", roles: ["admin"] }, async () => getEmailSettingsView());

export const PATCH = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ body, user, ip }) => {
  await updateEmailSettings(user!.id, body, { ip });
  return { ok: true };
});

