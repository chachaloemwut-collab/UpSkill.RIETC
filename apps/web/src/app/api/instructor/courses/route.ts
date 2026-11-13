import { z } from "zod";
import { route } from "@/server/http";
import { createCourse } from "@/server/courses/instructor.service";

const Body = z.strictObject({ title: z.string().trim().min(3).max(255), description: z.string().max(10_000).optional() });

export const POST = route<typeof Body>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ body, user }) =>
  createCourse(user!, body),
);
