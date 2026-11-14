import { route } from "@/server/http";
import { adminForcePasswordReset } from "@/server/admin/users.service";
import { uuidParam } from "@/server/params";

export const POST = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user, ip }) => {
  await adminForcePasswordReset(user!.id, uuidParam(params.id), { ip });
  return { ok: true };
});
