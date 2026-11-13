import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { verifyEmail } from "@/server/auth/auth.service";

// POST (not GET) so email link scanners that prefetch URLs can't consume the token
const Body = z.strictObject({ token: z.string().min(40).max(64) });

export const POST = route<typeof Body>(
  { auth: "none", body: Body, rateLimit: ({ ip }) => [[RATE_LIMITS.loginPerIp, ip]] },
  async ({ body }) => {
    await verifyEmail(body.token);
    return { ok: true };
  },
);
