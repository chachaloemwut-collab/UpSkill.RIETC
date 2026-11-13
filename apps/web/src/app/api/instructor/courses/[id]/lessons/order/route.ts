import { z } from "zod";
import { route } from "@/server/http";
import { reorderLessons } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ lesson_ids: z.array(z.uuid()).min(1).max(500) });

export const PUT = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body, maxBodyBytes: 32 * 1024 }, async ({ params, body, user }) => {
  await reorderLessons(user!, uuidParam(params.id), body.lesson_ids);
  return { ok: true };
});
