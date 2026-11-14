import { z } from "zod";
import { route } from "@/server/http";
import { startAssessment } from "@/server/courses/quiz.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  kind: z.enum(["pre", "lesson", "post"]),
  lesson_id: z.uuid().optional(),
});

export const POST = route<typeof Body, { id: string }>({ auth: "required", body: Body }, async ({ params, body, user }) =>
  startAssessment(user!.id, uuidParam(params.id), { kind: body.kind, lessonId: body.lesson_id }),
);
