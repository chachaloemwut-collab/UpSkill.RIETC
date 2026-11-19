import { z } from "zod";
import { route } from "@/server/http";
import { addQuestion, listPendingCorrections } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  question_text: z.string().trim().min(3).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
  correct_index: z.int().min(0).max(7),
  assessment_type: z.enum(["pre", "lesson", "post"]).default("post"),
  lesson_id: z.uuid().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

export const POST = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user }) =>
  addQuestion(user!, uuidParam(params.id), {
    text: body.question_text,
    options: body.options,
    correctIndex: body.correct_index,
    assessmentType: body.assessment_type,
    lessonId: body.lesson_id,
    tags: body.tags,
  }),
);

/** List pending (unapplied) score corrections for this course. */
export const GET = route<never, { id: string }>({ auth: "required", roles: ["instructor", "admin"] }, async ({ params, user }) =>
  listPendingCorrections(user!, uuidParam(params.id)),
);
