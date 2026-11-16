import type { Redis } from "ioredis";

// Atomic fixed-window counter (INCR + PEXPIRE in a single script)
const SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {c, redis.call('PTTL', KEYS[1])}
`;

export interface RateLimitRule {
  /** e.g. "hb:user" or "login:ip" */
  name: string;
  limit: number;
  windowMs: number;
}

/** Presets matching spec section 8, plus extra endpoints */
export const RATE_LIMITS = {
  heartbeatPerUser: { name: "hb:user", limit: 10, windowMs: 60_000 },
  loginPerIp: { name: "login:ip", limit: 50, windowMs: 5 * 60_000 },
  loginPerAccount: { name: "login:acct", limit: 20, windowMs: 5 * 60_000 },
  forgotPasswordPerAccount: { name: "forgot:acct", limit: 10, windowMs: 15 * 60_000 },
  registerPerIp: { name: "register:ip", limit: 20, windowMs: 15 * 60_000 },
  verifyPublicPerIp: { name: "verify:ip", limit: 60, windowMs: 60_000 },
  videoReportPerUser: { name: "vreport:user", limit: 10, windowMs: 15 * 60_000 },
  cohortApplyPerUser: { name: "cohort-apply:user", limit: 20, windowMs: 15 * 60_000 },
} satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export async function hitRateLimit(redis: Redis, rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  const key = `rl:${rule.name}:${subject}`;
  const [count, pttl] = (await redis.eval(SCRIPT, 1, key, String(rule.windowMs))) as [number, number];
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSec: Math.ceil(Math.max(pttl, 0) / 1000),
  };
}
