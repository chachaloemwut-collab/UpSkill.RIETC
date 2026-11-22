// Next.js 16: proxy.ts (formerly middleware.ts). Builds a per-request nonce-based CSP.
import { NextResponse, type NextRequest } from "next/server";

const SENSITIVE_AUTH_QUERY_KEYS = new Set(["password", "pass", "pwd", "new_password", "confirm"]);

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production"; // Next dev server needs eval + websocket HMR
  const isHttps = (process.env.APP_ORIGIN ?? "").startsWith("https://");

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' lets our nonced scripts load the YouTube IFrame API script
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https://i.ytimg.com`,
    `font-src 'self'`,
    `frame-src https://www.youtube-nocookie.com https://www.youtube.com`,
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    // installable app: our own service worker and manifest ('strict-dynamic' above would otherwise ignore 'self')
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `form-action 'self' https://accounts.google.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // A credential must never remain in a URL. This also protects users who open
  // an old link created before auth forms had an explicit POST fallback.
  if (request.nextUrl.pathname === "/login" && [...request.nextUrl.searchParams.keys()].some((key) => SENSITIVE_AUTH_QUERY_KEYS.has(key.toLowerCase()))) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.search = "";
    const redirect = NextResponse.redirect(cleanUrl, 307);
    redirect.headers.set("Cache-Control", "no-store");
    redirect.headers.set("Referrer-Policy", "no-referrer");
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
