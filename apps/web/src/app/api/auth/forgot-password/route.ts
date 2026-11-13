import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { emailKey } from "@/server/rate-keys";
import { forgotPassword } from "@/server/auth/auth.service";

const Body = z.strictObject({ email: z.email().max(254) });

// Per-account limit prevents mail-bombing a victim's inbox; it applies to unknown emails too (no enumeration)
export const POST = route<typeof Body>(
  {
    auth: "none",
    body: Body,
    rateLimit: ({ ip, body }) => [
      [RATE_LIMITS.loginPerIp, ip],
      [RATE_LIMITS.forgotPasswordPerAccount, emailKey(body.email)],
    ],
  },
  async ({ body }) => {
    await forgotPassword(body.email);
    return { ok: true, message: "หากมีบัญชีนี้อยู่ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปทางอีเมลแล้ว" };
  },
);
