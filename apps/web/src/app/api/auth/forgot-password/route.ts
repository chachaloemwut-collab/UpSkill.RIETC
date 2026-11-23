import { requireOutboundEmail } from "@/server/admin/email-settings.service";
import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { LoginIdentifier } from "@/server/auth/login-identifier";
import { emailKey } from "@/server/rate-keys";
import { forgotPassword } from "@/server/auth/auth.service";

// "email" keeps its name for old clients; it may also be a username (same rule as the login form)
const Body = z.strictObject({ email: LoginIdentifier });

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
    await requireOutboundEmail();
    await forgotPassword(body.email);
    return { ok: true, message: "หากมีบัญชีนี้อยู่ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลของบัญชี (ลิงก์ใช้ได้ 1 ชั่วโมง) หากไม่พบ ให้ดูในโฟลเดอร์จดหมายขยะ" };
  },
);
