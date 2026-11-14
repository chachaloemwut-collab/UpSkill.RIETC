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

function configuredDevHosts(): string[] {
  const configured = [process.env.APP_ORIGIN, ...(process.env.APP_ALLOWED_ORIGINS ?? "").split(",")];
  const hosts = configured.flatMap((value) => {
    try {
      return value?.trim() ? [new URL(value.trim()).hostname] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(hosts)];
}

const config: NextConfig = {
  // Self-contained server bundle for the Docker image; trace files from the monorepo root
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  reactStrictMode: true,
  // Development uses Next's default Turbopack pipeline. Production build uses
  // the explicit webpack configuration below for native Argon2 externals.
  turbopack: {},
  // Quick Tunnels use a second hostname in local development. Without this,
  // Next blocks its client assets and interactive forms cannot hydrate.
  allowedDevOrigins: configuredDevHosts(),
  transpilePackages: ["@upskill/core", "@upskill/infra", "@upskill/db"],
  // Argon2 loads a platform-specific native binary at runtime. Keep both the
  // wrapper and every optional platform package out of webpack's JS parser so
  // local macOS builds and Linux Docker builds use their own installed binary.
  serverExternalPackages: [
    "@node-rs/argon2",
    "@node-rs/argon2-android-arm-eabi",
    "@node-rs/argon2-android-arm64",
    "@node-rs/argon2-darwin-arm64",
    "@node-rs/argon2-darwin-x64",
    "@node-rs/argon2-freebsd-x64",
    "@node-rs/argon2-linux-arm-gnueabihf",
    "@node-rs/argon2-linux-arm64-gnu",
    "@node-rs/argon2-linux-arm64-musl",
    "@node-rs/argon2-linux-x64-gnu",
    "@node-rs/argon2-linux-x64-musl",
    "@node-rs/argon2-win32-arm64-msvc",
    "@node-rs/argon2-win32-ia32-msvc",
    "@node-rs/argon2-win32-x64-msvc",
    "bullmq",
    "pg",
  ],
  webpack(webpackConfig, { isServer }) {
    if (isServer) {
      const nativeArgon2External = (
        { request }: { request?: string },
        callback: (error?: Error | null, result?: string) => void,
      ) => {
        if (request === "@node-rs/argon2" || request?.startsWith("@node-rs/argon2-")) {
          callback(null, `commonjs ${request}`);
          return;
        }
        callback();
      };

      const currentExternals = webpackConfig.externals ?? [];
      webpackConfig.externals = Array.isArray(currentExternals)
        ? [...currentExternals, nativeArgon2External]
        : [currentExternals, nativeArgon2External];
    }
    return webpackConfig;
  },
  // Course covers are YouTube thumbnails, proxied through /_next/image so browsers never call Google for them
  images: { remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }] },
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
