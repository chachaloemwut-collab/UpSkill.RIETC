import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { changePassword } from "@/server/auth/auth.service";

const Body = z.strictObject({ current_password: z.string().max(256).optional(), new_password: z.string().min(1).max(256) });

export const POST = route<typeof Body>(
  { auth: "required", body: Body, rateLimit: ({ user }) => [[RATE_LIMITS.loginPerAccount, `pw:${user!.id}`]] },
  async ({ body, user, ip, userAgent }) => {
    await changePassword(user!, { currentPassword: body.current_password, newPassword: body.new_password }, { ip, userAgent });
    return { ok: true };
  },
);
