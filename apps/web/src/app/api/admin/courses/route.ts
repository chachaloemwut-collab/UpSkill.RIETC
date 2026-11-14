import { z } from "zod";
import { route } from "@/server/http";
import { createCourse } from "@/server/courses/instructor.service";

// Admin creates a course on behalf of an instructor (or for themself when instructor_id is their own id)
const Body = z.strictObject({ title: z.string().trim().min(3).max(255), description: z.string().max(10_000).optional(), instructor_id: z.uuid() });

export const POST = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ body, user, ip }) =>
  createCourse(user!, { title: body.title, description: body.description, instructorId: body.instructor_id }, { ip }),
);
