import { maskEmail } from "@/lib/mask-email";
import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { register } from "@/server/auth/auth.service";
import { ProfileBody } from "@/server/auth/profile.service";

const Body = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
  profile: ProfileBody,
  // The member read the privacy notice (PDPA) shown on the sign-up page and agrees to it
  pdpaConsent: z.boolean(),
});

export const POST = route<typeof Body>(
  { auth: "none", body: Body, rateLimit: ({ ip }) => [[RATE_LIMITS.registerPerIp, ip]] },
  async ({ body, ip, userAgent }) => {
    await register(body, { ip, userAgent });
    // Same response whether or not the email already exists (anti-enumeration)
    return { ok: true, message: `หากอีเมลนี้ยังไม่ได้ยืนยัน ระบบจะส่งลิงก์ไปที่ ${maskEmail(body.email)}` };
  },
);
