import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { HttpError, route } from "@/server/http";
import { completeGoogleSignup } from "@/server/auth/auth.service";
import { ProfileBody } from "@/server/auth/profile.service";

const Body = ProfileBody.extend({ pdpaConsent: z.literal(true) });
export const POST = route<typeof Body>({
  auth: "optional", body: Body, rateLimit: ({ ip }) => [[RATE_LIMITS.registerPerIp, ip]],
}, async ({ body, user, ip, userAgent }) => {
  if (user) throw new HttpError(409, "ALREADY_SIGNED_IN");
  await completeGoogleSignup(body, { ip, userAgent });
  return { ok: true };
});
