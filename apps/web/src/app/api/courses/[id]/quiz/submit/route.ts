import { z } from "zod";
import { route } from "@/server/http";
import { submitQuiz } from "@/server/courses/quiz.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  attempt_id: z.uuid(),
  // questionId -> optionId (opaque per-attempt ids)
  answers: z.record(z.uuid(), z.string().max(16)).refine((a) => Object.keys(a).length <= 200),
});

export const POST = route<typeof Body, { id: string }>({ auth: "required", body: Body, maxBodyBytes: 32 * 1024 }, async ({ params, body, user }) =>
  submitQuiz(user!.id, uuidParam(params.id), body.attempt_id, body.answers),
);
