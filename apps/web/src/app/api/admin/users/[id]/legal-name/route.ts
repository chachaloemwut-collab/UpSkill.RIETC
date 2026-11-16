import { z } from "zod";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { adminUpdateLegalName } from "@/server/admin/users.service";

const Body = z.object({
  th: z.string().max(255).nullable().optional(),
  en: z.string().max(255).nullable().optional(),
});

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ user, params, body, ip }) => {
  await adminUpdateLegalName(user!.id, uuidParam(params.id), body, { ip });
  return { ok: true };
});
