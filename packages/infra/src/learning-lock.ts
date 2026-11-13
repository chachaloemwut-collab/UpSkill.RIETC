/**
 * "One account, one viewing window" lock (spec: users.active_stream_token)
 * Moved to Redis because:
 *  - it changes on every heartbeat; no need to write the users table each time (avoids row lock contention)
 *  - SET is atomic: a new tab replaces the old one immediately, no race
 *  - TTL clears it automatically when a tab closes without saying goodbye
 */
import type { Redis } from "ioredis";

const TTL_MS = 120_000;
const key = (userId: string) => `learn:active:${userId}`;

/** Become the active window (old windows get 409 SESSION_SUPERSEDED on their next ping) */
export async function claimActiveLearningSession(redis: Redis, userId: string, sessionId: string, tokenHashHex: string) {
  await redis.set(key(userId), `${sessionId}:${tokenHashHex}`, "PX", TTL_MS);
}

const CHECK_AND_REFRESH = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 1
end
return 0
`;

/** true = still the active window (and extends the TTL) */
export async function assertActiveLearningSession(redis: Redis, userId: string, sessionId: string, tokenHashHex: string) {
  const r = await redis.eval(CHECK_AND_REFRESH, 1, key(userId), `${sessionId}:${tokenHashHex}`, String(TTL_MS));
  return r === 1;
}
