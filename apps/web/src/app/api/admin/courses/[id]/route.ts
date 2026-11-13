import { z } from "zod";
import { route } from "@/server/http";
import { adminUpdateCourse } from "@/server/admin/admin.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ visibility: z.enum(["suspended", "draft"]).optional(), is_verified_course: z.boolean().optional() });

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, body, user, ip }) => {
  await adminUpdateCourse(user!.id, uuidParam(params.id), body, { ip });
  return { ok: true };
});
