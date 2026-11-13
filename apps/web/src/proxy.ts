// Next.js 16: proxy.ts (formerly middleware.ts). Builds a per-request nonce-based CSP.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' lets our nonced scripts load the YouTube IFrame API script
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https://i.ytimg.com`,
    `font-src 'self'`,
    `frame-src https://www.youtube-nocookie.com https://www.youtube.com`,
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    `form-action 'self' https://accounts.google.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

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
