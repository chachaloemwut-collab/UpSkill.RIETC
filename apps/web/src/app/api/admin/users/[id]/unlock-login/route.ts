import { route } from "@/server/http";
import { adminUnlockLogin } from "@/server/admin/password.service";
import { uuidParam } from "@/server/params";

export const POST = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user, ip }) => adminUnlockLogin(user!.id, uuidParam(params.id), { ip }));
