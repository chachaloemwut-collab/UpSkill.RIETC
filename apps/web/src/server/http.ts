/**
 * Route wrapper used by every API handler, so the security checks can't be forgotten in any route:
 *  - CSRF: unsafe methods must send an Origin that matches APP_ORIGIN (in addition to SameSite=Lax)
 *  - body size limit + zod validation (reject unknown fields)
 *  - auth / role checks
 *  - rate limit
 *  - uniform errors, never leaking stack traces / internal messages
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { logger } from "@upskill/infra/logger";
import { hitRateLimit, type RateLimitRule } from "@upskill/infra/rate-limit";
import { ctx } from "./context";
import { getCurrentUser, type CurrentUser } from "./auth/session";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message ?? code);
  }
}

type Role = CurrentUser["role"];

interface Options<TBody extends z.ZodType> {
  auth?: "required" | "optional" | "none";
  roles?: readonly Role[];
  body?: TBody;
  maxBodyBytes?: number;
  rateLimit?: (c: { ip: string; user: CurrentUser | null }) => Array<[RateLimitRule, string]>;
}

export interface HandlerContext<TBody, TParams> {
  req: NextRequest;
  params: TParams;
  body: TBody;
  user: CurrentUser | null;
  ip: string;
  userAgent: string;
  requestId: string;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Use the IP set by the trusted reverse proxy only. Do not trust a client-sent X-Forwarded-For chain. */
export function clientIp(req: NextRequest): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "0.0.0.0";
}

export function route<TBody extends z.ZodType = z.ZodNever, TParams = Record<string, never>>(
  opts: Options<TBody>,
  fn: (c: HandlerContext<z.infer<TBody>, TParams>) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, routeCtx: { params: Promise<TParams> }): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const { env, redis } = ctx();

      if (!SAFE_METHODS.has(req.method)) {
        const origin = req.headers.get("origin");
        if (origin !== env.APP_ORIGIN) throw new HttpError(403, "BAD_ORIGIN");
      }

      const ip = clientIp(req);
      const user = opts.auth === "none" ? null : await getCurrentUser();
      if (opts.auth === "required" && !user) throw new HttpError(401, "UNAUTHENTICATED");
      if (opts.roles && (!user || !opts.roles.includes(user.role))) throw new HttpError(403, "FORBIDDEN");

      for (const [rule, subject] of opts.rateLimit?.({ ip, user }) ?? []) {
        const r = await hitRateLimit(redis, rule, subject);
        if (!r.allowed) throw new HttpError(429, "RATE_LIMITED", undefined, { "Retry-After": String(r.retryAfterSec) });
      }

      let body = undefined as z.infer<TBody>;
      if (opts.body) {
        const max = opts.maxBodyBytes ?? 16 * 1024;
        if (!req.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE");
        const text = await req.text();
        if (Buffer.byteLength(text) > max) throw new HttpError(413, "PAYLOAD_TOO_LARGE");
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new HttpError(400, "INVALID_JSON");
        }
        const parsed = opts.body.safeParse(json);
        if (!parsed.success) throw new HttpError(400, "VALIDATION_FAILED");
        body = parsed.data;
      }

      const result = await fn({
        req,
        params: await routeCtx.params,
        body,
        user,
        ip,
        userAgent: req.headers.get("user-agent")?.slice(0, 512) ?? "",
        requestId,
      });
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.code, requestId }, { status: err.status, ...(err.headers ? { headers: err.headers } : {}) });
      }
      logger.error({ err, requestId, path: req.nextUrl.pathname }, "unhandled error");
      return NextResponse.json({ error: "INTERNAL", requestId }, { status: 500 });
    }
  };
}
