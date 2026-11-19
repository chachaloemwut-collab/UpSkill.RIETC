import { z } from "zod";
import { route } from "@/server/http";
import { removeQuestion, updateQuestion } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const PatchBody = z.strictObject({
  question_text: z.string().trim().min(3).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
  correct_index: z.int().min(0).max(7),
  assessment_type: z.enum(["pre", "lesson", "post"]),
  lesson_id: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

export const PATCH = route<typeof PatchBody, { id: string; questionId: string }>(
  { auth: "required", roles: ["instructor", "admin"], body: PatchBody },
  async ({ params, body, user }) => {
    await updateQuestion(user!, uuidParam(params.id), uuidParam(params.questionId), {
      text: body.question_text,
      options: body.options,
      correctIndex: body.correct_index,
      assessmentType: body.assessment_type,
      lessonId: body.lesson_id ?? undefined,
      tags: body.tags,
    });
    return { ok: true };
  },
);

export const DELETE = route<never, { id: string; questionId: string }>(
  { auth: "required", roles: ["instructor", "admin"] },
  async ({ params, user }) => {
    await removeQuestion(user!, uuidParam(params.id), uuidParam(params.questionId));
    return { ok: true };
  },
);
