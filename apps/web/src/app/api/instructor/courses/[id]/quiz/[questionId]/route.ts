import { z } from "zod";
import { route } from "@/server/http";
import { removeQuestion, updateQuestion } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const PatchBody = z.object({
  question_text: z.string().trim().min(3),
  options: z.array(z.string().trim().min(1)).min(2).max(6),
  correct_index: z.number().int().min(0).max(5),
  assessment_type: z.enum(["pre", "lesson", "post"]),
  lesson_id: z.string().uuid().nullable().optional(),
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
