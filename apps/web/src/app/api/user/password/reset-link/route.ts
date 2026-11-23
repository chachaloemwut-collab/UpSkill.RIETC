import { requireOutboundEmail } from "@/server/admin/email-settings.service";
import { maskEmail } from "@/lib/mask-email";
import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { sendOwnResetLink } from "@/server/auth/auth.service";

const Body = z.strictObject({ emailId: z.uuid().optional() });

// Signed in but forgot the current password: mail a reset link to the account's own address.
// Shares the per-account forgot-password limit so it cannot be used to flood the inbox.
export const POST = route<typeof Body>(
  { auth: "required", body: Body, rateLimit: ({ user }) => [[RATE_LIMITS.forgotPasswordPerAccount, `self:${user!.id}`]] },
  async ({ user, body, ip, userAgent }) => {
    await requireOutboundEmail();
    const { email } = await sendOwnResetLink(user!.id, { ip, userAgent }, body.emailId);
    return { ok: true, email: maskEmail(email) };
  },
);
