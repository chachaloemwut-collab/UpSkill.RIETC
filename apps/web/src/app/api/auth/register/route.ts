import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { register } from "@/server/auth/auth.service";

const Body = z.strictObject({ email: z.email().max(254), password: z.string().min(1).max(256) });

export const POST = route<typeof Body>(
  { auth: "none", body: Body, rateLimit: ({ ip }) => [[RATE_LIMITS.registerPerIp, ip]] },
  async ({ body }) => {
    await register(body);
    // Same response whether or not the email already exists (anti-enumeration)
    return { ok: true, message: "หากอีเมลนี้ยังไม่ได้ยืนยัน เราได้ส่งลิงก์ยืนยันไปให้แล้ว" };
  },
);
