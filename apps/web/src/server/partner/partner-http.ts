/**
 * Wrapper for the partner (server-to-server) API. It replaces `route()` for /api/partner/* because callers are
 * other servers: no cookies and no Origin header. Instead every request must carry a valid API key and come from an
 * IP on that client's allowlist. Responses are never cached, bodies are size-limited and strictly validated, and every
 * call is written to partner_api_requests WITHOUT personal data from the request.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { bearerToken, ipAllowed, type PartnerScope } from "@upskill/core/partner-api";
import { logger } from "@upskill/infra/logger";
import { RATE_LIMITS, hitRateLimit } from "@upskill/infra/rate-limit";
import { ctx } from "../context";
import { HttpError, clientIp } from "../http";
import { findPartnerClient, logPartnerRequest, requireScope, type PartnerClient } from "./partner.service";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };

export interface PartnerOutcome {
  body: unknown;
  matched?: boolean;
  resultCount?: number;
}

export function partnerRoute<TBody extends z.ZodType>(
  opts: { endpoint: string; scope: PartnerScope; body?: TBody; maxBodyBytes?: number },
  fn: (c: { client: PartnerClient; body: z.infer<TBody>; requestId: string; reference: string | null }) => Promise<PartnerOutcome>,
) {
  return async (req: NextRequest): Promise<Response> => {
    const requestId = randomUUID();
    const ip = clientIp(req);
    let client: PartnerClient | null = null;
    let reference: string | null = null;
    try {
      // Per source IP before touching the database, so key guessing is slow and cheap to refuse
      const ipLimit = await hitRateLimit(ctx().redis, RATE_LIMITS.partnerPerIp, ip);
      if (!ipLimit.allowed) throw new HttpError(429, "RATE_LIMITED", undefined, { "Retry-After": String(ipLimit.retryAfterSec) });

      client = await findPartnerClient(bearerToken(req.headers.get("authorization")));
      if (!ipAllowed(ip, client.allowedIps)) throw new HttpError(403, "IP_NOT_ALLOWED");
      requireScope(client, opts.scope);
      const limit = await hitRateLimit(ctx().redis, RATE_LIMITS.partnerPerClient, client.id);
      if (!limit.allowed) throw new HttpError(429, "RATE_LIMITED", undefined, { "Retry-After": String(limit.retryAfterSec) });

      const ref = req.headers.get("x-request-reference");
      reference = ref && /^[\w.:-]{1,100}$/.test(ref) ? ref : null;

      let body = undefined as z.infer<TBody>;
      if (opts.body) {
        if (!req.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE");
        const text = await req.text();
        if (Buffer.byteLength(text) > (opts.maxBodyBytes ?? 2048)) throw new HttpError(413, "PAYLOAD_TOO_LARGE");
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

      const out = await fn({ client, body, requestId, reference });
      await logPartnerRequest({ clientId: client.id, endpoint: opts.endpoint, ip, status: 200, matched: out.matched ?? null, resultCount: out.resultCount ?? null, reference });
      return NextResponse.json({ request_id: requestId, ...(reference ? { reference } : {}), ...(out.body as object) }, { headers: NO_STORE });
    } catch (err) {
      const e = err instanceof HttpError ? err : null;
      if (!e) logger.error({ err, requestId, path: req.nextUrl.pathname }, "partner api error"); // never logs the body
      const status = e?.status ?? 500;
      const code = e?.code ?? "INTERNAL";
      await logPartnerRequest({ clientId: client?.id ?? null, endpoint: opts.endpoint, ip, status, errorCode: code, reference }).catch(() => {});
      return NextResponse.json({ error: code, request_id: requestId }, { status, headers: { ...NO_STORE, ...(e?.headers ?? {}) } });
    }
  };
}
