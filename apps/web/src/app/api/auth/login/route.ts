import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { emailKey } from "@/server/rate-keys";
import { login } from "@/server/auth/auth.service";

const Body = z.strictObject({ email: z.email().max(254), password: z.string().min(1).max(256) });

export const POST = route<typeof Body>(
  {
    auth: "none",
    body: Body,
    // Two limits: per IP (credential stuffing) and per account (targeted brute force)
    rateLimit: ({ ip, body }) => [
      [RATE_LIMITS.loginPerIp, ip],
      [RATE_LIMITS.loginPerAccount, emailKey(body.email)],
    ],
  },
  async ({ body, ip, userAgent }) => {
    await login(body, { ip, userAgent });
    return { ok: true };
  },
);
