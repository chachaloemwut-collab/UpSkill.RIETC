/**
 * Plain HTML form login: the fallback when the page's JavaScript did not run (older iPad/iPhone Safari,
 * some in-app browsers, slow networks). The JS login form posts JSON to /api/auth/login; this accepts the
 * same fields as application/x-www-form-urlencoded and answers with redirects instead of JSON.
 * Same protections as the JSON route: Origin check, per-IP and per-account rate limits, same login().
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { isAllowedOrigin } from "@upskill/infra/env";
import { RATE_LIMITS, hitRateLimit } from "@upskill/infra/rate-limit";
import { ctx } from "@/server/context";
import { HttpError, clientIp } from "@/server/http";
import { emailKey } from "@/server/rate-keys";
import { login } from "@/server/auth/auth.service";
import { logger } from "@upskill/infra/logger";

import { LoginIdentifier } from "@/server/auth/login-identifier";

const Password = z.string().min(1).max(256);

/** 303 to a same-site path (relative Location: never an open redirect) */
function back(path: string): Response {
  const u = new URL(path, "http://internal");
  return new Response(null, { status: 303, headers: { Location: u.pathname + u.search, "Cache-Control": "no-store" } });
}
const fail = (_req: NextRequest, code: string) => back(`/login?error=${encodeURIComponent(code)}`);

export async function POST(req: NextRequest): Promise<Response> {
  const { env, redis } = ctx();
  if (!isAllowedOrigin(env, req.headers.get("origin"))) return fail(req, "BAD_ORIGIN");
  if (!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return fail(req, "VALIDATION_FAILED");
  const text = await req.text();
  if (Buffer.byteLength(text) > 4096) return fail(req, "VALIDATION_FAILED");
  const form = new URLSearchParams(text);
  const ident = LoginIdentifier.safeParse(form.get("email"));
  const password = Password.safeParse(form.get("password") ?? "");
  if (!ident.success || !password.success) return fail(req, "INVALID_CREDENTIALS");

  const ip = clientIp(req);
  const limits: Array<[typeof RATE_LIMITS.loginPerIp, string]> = [[RATE_LIMITS.loginPerIp, ip]];
  // Same exemption as the JSON route: the owner account is never locked out per account
  if (ident.data !== "superadmin" && ident.data !== "system-owner@internal.invalid") limits.push([RATE_LIMITS.loginPerAccount, emailKey(ident.data)]);
  for (const [rule, subject] of limits) {
    if (!(await hitRateLimit(redis, rule, subject)).allowed) return fail(req, "RATE_LIMITED");
  }

  try {
    const { redirectTo } = await login({ email: ident.data, password: password.data }, { ip, userAgent: req.headers.get("user-agent") ?? "" });
    // redirectTo is built by login() (internal paths only)
    return back(redirectTo.startsWith("/") ? redirectTo : "/");
  } catch (err) {
    if (err instanceof HttpError) return fail(req, err.code);
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "form login failed");
    return fail(req, "INTERNAL");
  }
}
