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
  credential_enabled: z.boolean().optional(),
  credential_type: z.string().regex(/^[a-z0-9_]+$/).max(40).optional(),
  credential_name_th: z.string().trim().min(1).max(120).optional(),
  credential_name_en: z.string().trim().max(120).nullable().optional(),
  credential_template_key: z.enum(["standard", "classic", "royal", "minimal"]).optional(),
  credential_background_url: z.string().url().regex(/^https:\/\//).max(500).nullable().optional(),
  credential_text_align: z.enum(["center", "left"]).optional(),
  credential_validity_days: z.int().min(1).max(36_500).nullable().optional(),
  credential_signer_name: z.string().trim().max(255).nullable().optional(),
  credential_signer_title: z.string().trim().max(255).nullable().optional(),
  credential_achievement_th: z.string().trim().min(1).max(255).optional(),
  credential_achievement_en: z.string().trim().max(255).nullable().optional(),
  navigation_mode: z.enum(["linear", "free_complete"]).optional(),
  completion_rule: z.enum(["post_test", "lesson_tests_average"]).optional(),
  course_type: z.enum(["certified_training", "short_course"]).optional(),
  // Shape is enforced by the core parser (unknown fields dropped); only size is limited here
  application_settings: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user, ip }) => {
  const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  await updateCourse(user!, uuidParam(params.id), patch, ip);
  return { ok: true };
});
