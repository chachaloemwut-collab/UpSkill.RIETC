import { z } from "zod";
import { route } from "@/server/http";
import { assignCourse } from "@/server/assignments/assignment.service";

const Body = z.strictObject({
  course_id: z.uuid(),
  target_type: z.enum(["user", "group"]),
  target: z.string().trim().min(1).max(254),
  due_at: z.iso.datetime().optional(),
  note: z.string().trim().max(2000).optional(),
});

export const POST = route<typeof Body>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ user, body, ip }) =>
  assignCourse(user!, {
    courseId: body.course_id,
    targetType: body.target_type,
    target: body.target,
    ...(body.due_at ? { dueAt: new Date(body.due_at) } : {}),
    ...(body.note ? { note: body.note } : {}),
  }, ip),
);
