import { z } from "zod";
import { route } from "@/server/http";
import { updateCourse } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  title: z.string().trim().min(3).max(255).optional(),
  description: z.string().max(10_000).nullable().optional(),
  min_watch_percentage: z.int().min(50).max(100).optional(),
  passing_quiz_score: z.int().min(0).max(100).optional(),
  is_sequential_locked: z.boolean().optional(),
  max_quiz_attempts_per_day: z.int().min(1).max(20).optional(),
  quiz_time_limit_sec: z.int().min(60).max(14_400).optional(),
});

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user }) => {
  const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  await updateCourse(user!, uuidParam(params.id), patch);
  return { ok: true };
});
