import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { recordAssessmentFocus } from "@/server/courses/quiz.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  attempt_id: z.uuid(),
  event_type: z.enum(["hidden", "pagehide"]),
  elapsed_sec: z.int().min(0).max(14_400),
});

export const POST = route<typeof Body, { id: string }>(
  {
    auth: "required",
    body: Body,
    rateLimit: ({ user }) => [[RATE_LIMITS.heartbeatPerUser, user!.id]],
  },
  async ({ params, body, user }) =>
    recordAssessmentFocus(user!.id, uuidParam(params.id), body.attempt_id, body.event_type, body.elapsed_sec),
);
