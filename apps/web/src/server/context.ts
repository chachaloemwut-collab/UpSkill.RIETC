import "server-only";
import { createDb, type Database } from "@upskill/db";
import { getEnv, type Env } from "@upskill/infra/env";
import { createRedis, type Redis } from "@upskill/infra/redis";

// Singletons that survive HMR in dev (avoids leaking DB pool connections)
const g = globalThis as unknown as { __upskill?: { db: Database; redis: Redis } };

export function ctx(): { env: Env; db: Database; redis: Redis } {
  const env = getEnv();
  g.__upskill ??= { db: createDb(env.DATABASE_URL), redis: createRedis(env.REDIS_URL) };
  return { env, ...g.__upskill };
}
