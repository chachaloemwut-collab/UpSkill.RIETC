import { Redis } from "ioredis";

/** BullMQ connections need maxRetriesPerRequest = null */
export function createRedis(url: string, opts: { maxRetriesPerRequest?: number | null } = {}): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: opts.maxRetriesPerRequest === undefined ? 2 : opts.maxRetriesPerRequest,
    enableAutoPipelining: true,
  });
}
export type { Redis };
