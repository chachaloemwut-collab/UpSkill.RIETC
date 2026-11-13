import { defineConfig } from "vitest/config";

// Runs against a live stack: `pnpm infra:up`, web on :3000, worker running, seeded DB.
export default defineConfig({
  test: {
    include: ["*.e2e.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
