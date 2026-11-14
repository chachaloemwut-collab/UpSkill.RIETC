import { z } from "zod";
import { route } from "@/server/http";
import { submitAssessment } from "@/server/courses/quiz.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  attempt_id: z.uuid(),
  answers: z.record(z.uuid(), z.string().max(16)).refine((answers) => Object.keys(answers).length <= 200),
});

export const POST = route<typeof Body, { id: string }>({ auth: "required", body: Body, maxBodyBytes: 32 * 1024 }, async ({ params, body, user }) =>
  submitAssessment(user!.id, uuidParam(params.id), body.attempt_id, body.answers),
);
