import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { sendOwnResetLink } from "@/server/auth/auth.service";

const Body = z.strictObject({});

// Signed in but forgot the current password: mail a reset link to the account's own address.
// Shares the per-account forgot-password limit so it cannot be used to flood the inbox.
export const POST = route<typeof Body>(
  { auth: "required", body: Body, rateLimit: ({ user }) => [[RATE_LIMITS.forgotPasswordPerAccount, `self:${user!.id}`]] },
  async ({ user, ip, userAgent }) => {
    const { email } = await sendOwnResetLink(user!.id, { ip, userAgent });
    return { ok: true, email };
  },
);
