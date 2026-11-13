// Validate env at startup: fail fast if a secret is missing or too weak (don't let it surface at runtime)
import { z } from "zod";

const b64u = (minBytes: number) =>
  z.string().refine((s) => /^[A-Za-z0-9_-]+$/.test(s) && Buffer.from(s, "base64url").length >= minBytes, {
    message: `must be base64url with at least ${minBytes} bytes`,
  });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.url(),
  DATABASE_URL: z.string().startsWith("postgres"),
  REDIS_URL: z.string().startsWith("redis"),
  GOOGLE_CLIENT_ID: z.string().min(10),
  GOOGLE_CLIENT_SECRET: z.string().min(10),
  GOOGLE_REDIRECT_URI: z.url(),
  YOUTUBE_API_KEY: z.string().min(20),
  CERT_SIGNING_ACTIVE_KID: z.string().min(3),
  CERT_SIGNING_PRIVATE_KEY: b64u(32),
  CERT_PUBLIC_KEYS: z
    .string()
    .transform((s, ctx) => {
      try {
        return z.record(z.string(), b64u(32)).parse(JSON.parse(s));
      } catch {
        ctx.addIssue({ code: "custom", message: "CERT_PUBLIC_KEYS must be a JSON object {kid: base64url}" });
        return z.NEVER;
      }
    }),
  SMTP_URL: z.string().startsWith("smtp"),
  MAIL_FROM: z.string().min(3),
}).superRefine((env, ctx) => {
  if (!env.CERT_PUBLIC_KEYS[env.CERT_SIGNING_ACTIVE_KID]) {
    ctx.addIssue({ code: "custom", path: ["CERT_PUBLIC_KEYS"], message: "must contain the active kid" });
  }
  if (env.NODE_ENV === "production" && !env.APP_ORIGIN.startsWith("https://")) {
    ctx.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "must be https in production" });
  }
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Print only the field names, never the values (prevents secrets leaking into logs)
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid environment:\n  ${fields}`);
  }
  cached = parsed.data;
  return cached;
}
