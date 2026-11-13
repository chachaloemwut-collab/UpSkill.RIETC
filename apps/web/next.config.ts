import path from "node:path";
import type { NextConfig } from "next";

// Static security headers. The CSP needs a per-request nonce, so it lives in src/proxy.ts
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // YouTube embeds require a Referer (otherwise error 153), so don't use no-referrer
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)",
  },
];

const config: NextConfig = {
  // Self-contained server bundle for the Docker image; trace files from the monorepo root
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@upskill/core", "@upskill/infra", "@upskill/db"],
  serverExternalPackages: ["@node-rs/argon2", "pg"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // APIs must never be cached by a proxy/CDN
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  async rewrites() {
    return [{ source: "/.well-known/certificate-keys.json", destination: "/api/public/certificate-keys" }];
  },
};

export default config;
