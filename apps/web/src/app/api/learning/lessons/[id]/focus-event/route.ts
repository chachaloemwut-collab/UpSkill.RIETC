import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { HttpError, route } from "@/server/http";
import { recordLearningFocusLoss } from "@/server/learning/heartbeat.service";

const Body = z.strictObject({
  stream_token: z.string().min(40).max(64),
  event_type: z.enum(["hidden", "pagehide"]),
  current_second: z.number().min(0).max(86_400),
});

export const POST = route<typeof Body, { id: string }>(
  {
    auth: "required",
    body: Body,
    maxBodyBytes: 1024,
    rateLimit: ({ user }) => [[RATE_LIMITS.heartbeatPerUser, user!.id]],
  },
  async ({ params, body, user }) => {
    if (!z.uuid().safeParse(params.id).success) throw new HttpError(404, "NOT_FOUND");
    return recordLearningFocusLoss({
      userId: user!.id,
      lessonId: params.id,
      streamToken: body.stream_token,
      eventType: body.event_type,
      positionSec: body.current_second,
    });
  },
);
