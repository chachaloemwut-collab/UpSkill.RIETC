import { z } from "zod";
import { route } from "@/server/http";
import { updateQuizDrawCount } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  draw_count: z.number().int().min(1).max(200).nullable(),
});

/** Set how many questions to draw per attempt (null = use all). */
export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user }) => {
  await updateQuizDrawCount(user!, uuidParam(params.id), body.draw_count);
  return { ok: true };
});
