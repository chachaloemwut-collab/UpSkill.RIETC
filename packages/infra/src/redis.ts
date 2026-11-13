import { Redis } from "ioredis";

export function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 2,
    enableAutoPipelining: true,
    lazyConnect: false,
  });
}
export type { Redis };
