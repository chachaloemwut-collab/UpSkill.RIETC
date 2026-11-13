import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route, HttpError } from "@/server/http";
import { processHeartbeat } from "@/server/learning/heartbeat.service";

// [CHANGED] client_timestamp removed: the server doesn't use the client clock at all (it can be forged).
// seq is added for anti-replay instead.
const Body = z.strictObject({
  stream_token: z.string().min(40).max(64),
  seq: z.int().min(1).max(1_000_000),
  current_second: z.number().min(0).max(86_400),
});

export const POST = route<typeof Body, { id: string }>(
  {
    auth: "required",
    body: Body,
    maxBodyBytes: 1024,
    rateLimit: ({ user }) => [[RATE_LIMITS.heartbeatPerUser, user!.id]],
  },
  async ({ params, body, user, ip }) => {
    if (!z.uuid().safeParse(params.id).success) throw new HttpError(404, "NOT_FOUND");
    return processHeartbeat({
      userId: user!.id,
      lessonId: params.id,
      streamToken: body.stream_token,
      seq: body.seq,
      positionSec: body.current_second,
      ip,
    });
  },
);
