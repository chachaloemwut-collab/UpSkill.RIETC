// Validate env at startup: fail fast if a secret is missing or too weak (don't let it surface at runtime)
import { z } from "zod";

const b64u = (minBytes: number) =>
  z.string().refine((s) => /^[A-Za-z0-9_-]+$/.test(s) && Buffer.from(s, "base64url").length >= minBytes, {
    message: `must be base64url with at least ${minBytes} bytes`,
  });

/** Empty string in .env counts as "not set" */
const optional = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === "" ? undefined : v), t.optional());

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Deployment environment (separate from NODE_ENV, which is only the build mode: `next start`
    // always sets NODE_ENV=production, even when you run the production build on your laptop).
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    APP_ORIGIN: z.url(),
    DATABASE_URL: z.string().startsWith("postgres"),
    REDIS_URL: z.string().startsWith("redis"),

    // Optional integrations: when missing, the related feature is disabled with a clear error
    GOOGLE_CLIENT_ID: optional(z.string().min(10)),
    GOOGLE_CLIENT_SECRET: optional(z.string().min(10)),
    GOOGLE_REDIRECT_URI: optional(z.url()),
    YOUTUBE_API_KEY: optional(z.string().min(20)),

    CERT_SIGNING_ACTIVE_KID: z.string().min(3),
    CERT_SIGNING_PRIVATE_KEY: b64u(32),
    CERT_PUBLIC_KEYS: z.string().transform((s, ctx) => {
      try {
        return z.record(z.string(), b64u(32)).parse(JSON.parse(s));
      } catch {
        ctx.addIssue({ code: "custom", message: "CERT_PUBLIC_KEYS must be a JSON object {kid: base64url}" });
        return z.NEVER;
      }
    }),
    /** Where rendered certificate PDFs are stored (shared by web + worker). Replace with object storage in prod. */
    CERT_STORAGE_DIR: z.string().min(1).default("./var/certificates"),

    SMTP_URL: z.string().startsWith("smtp"),
    MAIL_FROM: z.string().min(3),
  })
  .superRefine((env, ctx) => {
    if (!env.CERT_PUBLIC_KEYS[env.CERT_SIGNING_ACTIVE_KID]) {
      ctx.addIssue({ code: "custom", path: ["CERT_PUBLIC_KEYS"], message: "must contain the active kid" });
    }
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_ID"], message: "set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither" });
    }
    if (env.APP_ENV === "production") {
      if (!env.APP_ORIGIN.startsWith("https://")) ctx.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "must be https in production" });
      if (!env.YOUTUBE_API_KEY) ctx.addIssue({ code: "custom", path: ["YOUTUBE_API_KEY"], message: "required in production" });
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

export function googleConfig(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI ?? `${env.APP_ORIGIN}/api/auth/google/callback`,
  };
}

/** Cookies get Secure + the __Host- prefix whenever the site is served over https */
export function isHttpsOrigin(env: Env): boolean {
  return env.APP_ORIGIN.startsWith("https://");
}
