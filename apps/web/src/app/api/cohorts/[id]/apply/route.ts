import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { applyToCohort, withdrawRegistration } from "@/server/programs/cohorts.service";
import { uuidParam } from "@/server/params";

// Answers are validated against the cohort's own form (unknown keys are dropped before storage)
const Body = z.strictObject({ answers: z.record(z.string().max(40), z.string().max(2000)).default({}) });

export const POST = route<typeof Body, { id: string }>(
  { auth: "required", body: Body, maxBodyBytes: 32 * 1024, rateLimit: ({ user }) => [[RATE_LIMITS.cohortApplyPerUser, user!.id]] },
  async ({ params, body, user }) => applyToCohort(user!, uuidParam(params.id), body.answers),
);

export const DELETE = route<never, { id: string }>({ auth: "required" }, async ({ params, user }) => {
  await withdrawRegistration(user!, uuidParam(params.id));
  return { ok: true };
});
