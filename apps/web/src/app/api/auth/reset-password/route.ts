import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { resetPassword } from "@/server/auth/auth.service";

const Body = z.strictObject({ token: z.string().min(40).max(64), new_password: z.string().min(1).max(256) });

export const POST = route<typeof Body>(
  { auth: "none", body: Body, rateLimit: ({ ip }) => [[RATE_LIMITS.loginPerIp, ip]] },
  async ({ body, ip, userAgent }) => {
    await resetPassword({ token: body.token, newPassword: body.new_password }, { ip, userAgent });
    return { ok: true };
  },
);
