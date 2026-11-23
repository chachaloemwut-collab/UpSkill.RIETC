import { emailRequestsAvailable } from "@/server/admin/email-settings.service";
import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { HttpError, route } from "@/server/http";
import { emailKey } from "@/server/rate-keys";
import { forgotPassword } from "@/server/auth/auth.service";

// "email" keeps its name for old clients; it may also be a username (same rule as the login form)
const Body = z.strictObject({ email: z.union([z.email().max(254), z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9._-]{2,31}$/)]) });

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
    if (!await emailRequestsAvailable()) throw new HttpError(503,"EMAIL_UNAVAILABLE","ขณะนี้ระบบอีเมลยังไม่พร้อมส่งลิงก์ กรุณาติดต่อผู้ดูแลระบบ");
    await forgotPassword(body.email);
    return { ok: true, message: "หากมีบัญชีนี้อยู่ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลของบัญชี (ลิงก์ใช้ได้ 1 ชั่วโมง) หากไม่พบ ให้ดูในโฟลเดอร์จดหมายขยะ" };
  },
);
