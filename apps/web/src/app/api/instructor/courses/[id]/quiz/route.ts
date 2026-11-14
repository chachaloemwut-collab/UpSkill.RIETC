import { z } from "zod";
import { route } from "@/server/http";
import { addQuestion } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  question_text: z.string().trim().min(3).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
  correct_index: z.int().min(0).max(7),
  assessment_type: z.enum(["pre", "lesson", "post"]).default("post"),
  lesson_id: z.uuid().optional(),
});

export const POST = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user }) =>
  addQuestion(user!, uuidParam(params.id), {
    text: body.question_text,
    options: body.options,
    correctIndex: body.correct_index,
    assessmentType: body.assessment_type,
    lessonId: body.lesson_id,
  }),
);
