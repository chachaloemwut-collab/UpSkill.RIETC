import { route } from "@/server/http";
import { adminCreateResetLink } from "@/server/admin/password.service";
import { uuidParam } from "@/server/params";

export const POST = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user, ip }) => ({
  ok: true,
  ...(await adminCreateResetLink(user!.id, uuidParam(params.id), { ip })),
}));
