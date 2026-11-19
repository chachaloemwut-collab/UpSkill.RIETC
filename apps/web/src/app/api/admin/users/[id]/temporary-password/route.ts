import { z } from "zod";
import { route } from "@/server/http";
import { adminSetTemporaryPassword } from "@/server/admin/password.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  // Empty = let the server generate one
  password: z.string().max(256).optional(),
  verifyEmail: z.boolean().default(false),
});

export const POST = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, user, ip, body }) => ({
  ok: true,
  ...(await adminSetTemporaryPassword(user!.id, uuidParam(params.id), { password: body.password, verifyEmail: body.verifyEmail }, { ip })),
}));
