# syntax=docker/dockerfile:1.7
# Production image for apps/worker (BullMQ jobs + Playwright PDF rendering). Build from the repo root:
#   docker build -f infra/docker/worker.Dockerfile -t upskill-worker .
FROM node:24-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

FROM base AS deps
COPY --chown=10001:10001 package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY --chown=10001:10001 apps/worker/package.json apps/worker/
COPY --chown=10001:10001 packages/core/package.json packages/core/
COPY --chown=10001:10001 packages/db/package.json packages/db/
COPY --chown=10001:10001 packages/infra/package.json packages/infra/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod=false --filter "@upskill/worker..."
# Chromium + its system libraries (only the headless shell is needed for page.pdf)
RUN cd apps/worker && ./node_modules/.bin/playwright install --with-deps --only-shell chromium

FROM deps AS runtime
COPY --chown=10001:10001 packages packages
COPY --chown=10001:10001 apps/worker apps/worker
COPY --chown=10001:10001 infra/docker/worker-healthcheck.mjs /healthcheck.mjs
# uid/gid 10001 = same as the web image (shared certificates volume)
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --create-home app \
    && mkdir -p /data/certificates && chown app:app /data/certificates
ENV NODE_ENV=production CERT_STORAGE_DIR=/data/certificates
USER app
WORKDIR /repo/apps/worker
# Redis PING: the worker is only "healthy" when it can actually reach the queue backend.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "/healthcheck.mjs"]
CMD ["node", "--import", "tsx", "src/index.ts"]
