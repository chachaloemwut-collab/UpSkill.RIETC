import { z } from "zod";
import { route } from "@/server/http";
import { adminSendResetEmail } from "@/server/admin/password.service";
import { uuidParam } from "@/server/params";

// logout: also sign the user out on every device right away (the previous, only, behaviour)
const Body = z.strictObject({ logout: z.boolean().default(true) });

export const POST = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, user, ip, body }) => ({
  ok: true,
  ...(await adminSendResetEmail(user!.id, uuidParam(params.id), { logout: body.logout }, { ip })),
}));
