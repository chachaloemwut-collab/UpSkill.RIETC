import { z } from "zod";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { adminSetEnrollmentStatus } from "@/server/admin/users.service";

const Body = z.object({
  status: z.enum(["completed", "in_progress", "dropped"]),
});

export const POST = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ user, params, body, ip }) => {
  await adminSetEnrollmentStatus(user!.id, uuidParam(params.id), body.status, { ip });
  return { ok: true };
});
