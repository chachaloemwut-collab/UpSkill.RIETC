import { z } from "zod";
import { route } from "@/server/http";
import { setProgramCourses } from "@/server/programs/programs.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ courses: z.array(z.strictObject({ courseId: z.uuid(), isRequired: z.boolean() })).max(50) });

export const PUT = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, body, user }) => {
  await setProgramCourses(user!, uuidParam(params.id), body.courses);
  return { ok: true };
});
