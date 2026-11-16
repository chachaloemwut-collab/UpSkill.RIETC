import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { adminUnlockLegalName } from "@/server/admin/users.service";

export const POST = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ user, params, ip }) => {
  await adminUnlockLegalName(user!.id, uuidParam(params.id), { ip });
  return { ok: true };
});
