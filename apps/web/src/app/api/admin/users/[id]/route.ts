import { z } from "zod";
import { route } from "@/server/http";
import { adminUpdateUserById, getUserDetailAdmin } from "@/server/admin/users.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  role: z.enum(["member", "instructor", "admin"]).optional(),
  status: z.enum(["active", "suspended", "banned"]).optional(),
});

export const GET = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params }) => getUserDetailAdmin(uuidParam(params.id)));

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, body, user, ip }) => {
  await adminUpdateUserById(user!.id, uuidParam(params.id), body, { ip });
  return { ok: true };
});
