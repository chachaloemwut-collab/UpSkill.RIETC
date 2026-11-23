import { requireOutboundEmail } from "@/server/admin/email-settings.service";
import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { emailKey } from "@/server/rate-keys";
import { resendVerification } from "@/server/auth/auth.service";

const Body = z.strictObject({ email: z.union([z.email().max(254), z.string().regex(/^[a-z][a-z0-9._-]{2,31}$/i)]) });

// The per-account limit applies whether or not the account exists, so a 429 reveals nothing
export const POST = route<typeof Body>(
  {
    auth: "none",
    body: Body,
    rateLimit: ({ ip, body }) => [
      [RATE_LIMITS.registerPerIp, ip],
      [RATE_LIMITS.forgotPasswordPerAccount, `verify:${emailKey(body.email)}`],
    ],
  },
  async ({ body }) => {
    await requireOutboundEmail();
    await resendVerification(body.email);
    return { ok: true };
  },
);
