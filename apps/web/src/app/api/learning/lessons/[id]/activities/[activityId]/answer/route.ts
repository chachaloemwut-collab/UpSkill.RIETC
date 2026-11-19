import { z } from "zod";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { submitActivityAnswer } from "@/server/learning/activity-learner.service";

const Body = z.strictObject({
  option_index: z.int().min(0).max(20),
  enrollment_id: z.string().uuid(),
});

type Params = { id: string; activityId: string };

/**
 * Submit a learner answer for a specific lesson activity (2A.3).
 * The frontend must pass the enrollmentId it received from start-session.
 */
export const POST = route<typeof Body, Params>({ auth: "required", body: Body }, async ({ params, body, user }) =>
  submitActivityAnswer(user!.id, body.enrollment_id, uuidParam(params.activityId), body.option_index),
);
