import { z } from "zod";
import { route } from "@/server/http";
import { adminUpdateCourse } from "@/server/admin/admin.service";
import { reassignInstructor } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  visibility: z.enum(["suspended", "draft"]).optional(),
  is_verified_course: z.boolean().optional(),
  instructor_id: z.uuid().optional(),
});

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, body, user, ip }) => {
  const id = uuidParam(params.id);
  if (body.instructor_id) await reassignInstructor(user!, id, body.instructor_id, { ip });
  await adminUpdateCourse(user!.id, id, { visibility: body.visibility, is_verified_course: body.is_verified_course }, { ip });
  return { ok: true };
});
