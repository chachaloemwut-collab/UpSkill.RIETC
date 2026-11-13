import { z } from "zod";
import { route } from "@/server/http";
import { adminUpdateUser } from "@/server/admin/admin.service";

const Body = z.strictObject({
  email: z.email(),
  role: z.enum(["member", "instructor", "admin"]).optional(),
  status: z.enum(["active", "suspended", "banned"]).optional(),
});

export const PATCH = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ body, user }) => {
  await adminUpdateUser(user!.id, body.email, { role: body.role, status: body.status });
  return { ok: true };
});
