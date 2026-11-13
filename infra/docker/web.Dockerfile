# syntax=docker/dockerfile:1.7
# Production image for apps/web (Next.js standalone output). Build from the repo root:
#   docker build -f infra/docker/web.Dockerfile -t upskill-web .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/infra/package.json packages/infra/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@upskill/web..."

FROM deps AS build
COPY packages packages
COPY apps/web apps/web
RUN pnpm --filter @upskill/web build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# Run as an unprivileged user. Fixed uid/gid 10001 = same as the worker image, so both can share the
# certificates volume. Writable paths: the image-optimizer cache and the certificates mount point only.
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
RUN mkdir -p apps/web/.next/cache /data/certificates && chown app:app apps/web/.next/cache /data/certificates
USER app
EXPOSE 3000
# /login renders without a session (no DB write); PORT is set at runtime (compose overrides it)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- "http://127.0.0.1:${PORT}/login" >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
