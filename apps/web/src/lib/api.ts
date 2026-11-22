"use client";
import { errorMessage } from "./errors";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string; retryAfter?: number };

/** fetch wrapper for our JSON API. Same-origin only: the browser adds the Origin header the server checks. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? {} : { "content-type": "application/json" },
      body: init.body === undefined ? null : JSON.stringify(init.body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, code: "NETWORK", message: errorMessage("NETWORK") };
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 503) window.dispatchEvent(new Event("rietc:service-unavailable"));
    const code = typeof data.error === "string" ? data.error : "INTERNAL";
    const headerRetry = res.headers.get("retry-after");
    const retryAfter = typeof data.retryAfter === "number" ? data.retryAfter : (headerRetry ? parseInt(headerRetry, 10) : undefined);
    return {
      ok: false,
      status: res.status,
      code,
      message: errorMessage(code, typeof data.message === "string" ? data.message : undefined),
      ...(retryAfter !== undefined && !Number.isNaN(retryAfter) ? { retryAfter } : {}),
    };
  }
  return { ok: true, data: data as T };
}
