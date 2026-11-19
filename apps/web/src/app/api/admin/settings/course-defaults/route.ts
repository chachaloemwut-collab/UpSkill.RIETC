import { z } from "zod";
import { route } from "@/server/http";
import { getCourseDefaults, updateCourseDefaults } from "@/server/system-settings.service";

export const GET = route({ auth: "required", roles: ["admin"] }, async () => getCourseDefaults());

const Body = z.strictObject({
  min_watch_percentage: z.number().int().min(50).max(100).optional(),
  passing_quiz_score: z.number().int().min(0).max(100).optional(),
  max_quiz_attempts_per_day: z.number().int().min(1).max(20).optional(),
  quiz_time_limit_min: z.number().int().min(1).max(240).optional(),
  is_sequential_locked: z.boolean().optional(),
  navigation_mode: z.enum(["free_complete", "linear"]).optional(),
  completion_rule: z.enum(["post_test", "lesson_tests_average"]).optional(),
});
export const PATCH = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ user, body }) =>
  updateCourseDefaults(user!, body),
);
