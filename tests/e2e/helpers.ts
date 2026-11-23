import { Redis } from "ioredis";
import pg from "pg";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:8025";
// Owner connection: test-only helpers that set up state the UI would take minutes to reach
export const OWNER_DB = process.env.DATABASE_MIGRATION_URL ?? "postgres://upskill_owner:dev_owner_password@127.0.0.1:55432/upskill";
export const REDIS = process.env.REDIS_URL ?? "redis://:dev_redis_password@127.0.0.1:6379/0";
export const SEED_PASSWORD = "upskill-dev-password";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal browser-like client: cookie jar + Origin header on unsafe methods */
export class Client {
  cookies = new Map<string, string>();
  lastSetCookie: string[] = [];
  constructor(private origin: string | null = BASE) {}

  async req(path: string, init: { method?: string; body?: unknown; origin?: string | null; headers?: Record<string, string> } = {}) {
    const method = init.method ?? (init.body === undefined ? "GET" : "POST");
    const headers: Record<string, string> = { ...init.headers };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    const origin = init.origin === undefined ? this.origin : init.origin;
    if (origin && method !== "GET") headers.origin = origin;
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");

    const res = await fetch(BASE + path, { method, headers, body: init.body === undefined ? null : JSON.stringify(init.body), redirect: "manual" });
    this.lastSetCookie = res.headers.getSetCookie();
    for (const c of this.lastSetCookie) {
      const [pair] = c.split(";");
      const i = pair!.indexOf("=");
      const name = pair!.slice(0, i);
      const value = pair!.slice(i + 1);
      if (value === "" || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, json, text, headers: res.headers };
  }

  async login(email: string, password: string) {
    const r = await this.req("/api/auth/login", { body: { email, password } });
    if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${r.text}`);
    return r;
  }
}

export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: OWNER_DB });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Rate limits persist for 15-60 min; clear them so repeated local runs start clean */
export async function resetRateLimits() {
  const r = new Redis(REDIS);
  const keys = await r.keys("rl:*");
  if (keys.length) await r.del(...keys);
  r.disconnect();
}

/** Wait for an email to arrive in Mailpit and return the first link in it */
export async function waitForEmailLink(to: string, pathPrefix: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()) as { messages: Array<{ ID: string }> };
    for (const m of list.messages ?? []) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string };
      const link = msg.Text.match(new RegExp(`https?://\\S+${pathPrefix}\\S+`))?.[0];
      if (link) return link;
    }
    await sleep(500);
  }
  throw new Error(`no email with ${pathPrefix} for ${to} (is the worker running?)`);
}

/** Inspect delivery at the test mailbox, including the actual attachment metadata. */
export async function waitForAttachment(to: string, filename: string) {
  for (let i = 0; i < 40; i++) {
    const query = encodeURIComponent(`to:"${to}"`);
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${query}`)).json() as { messages: Array<{ ID: string }> };
    for (const message of list.messages ?? []) {
      const detail = await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json() as { Attachments?: Array<{ FileName: string; Size: number }> };
      if (detail.Attachments?.some(file => file.FileName === filename && file.Size > 0)) return;
    }
    await sleep(500);
  }
  throw new Error(`Missing attachment: ${filename}`);
}

/** Random Thai national ID with a correct check digit (first digit 1-8, never a real person by design of the test) */
export function randomNationalId(): string {
  const first12 = String(1 + Math.floor(Math.random() * 8)) + Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join("");
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return first12 + String((11 - (sum % 11)) % 10);
}

/** A complete, valid member profile for /api/auth/register and /api/user/profile */
export function profileBody(over: Record<string, unknown> = {}) {
  return {
    titleTh: "นาย",
    firstNameTh: "ทดสอบ",
    lastNameTh: "ระบบ",
    titleEn: "Mr.",
    firstNameEn: "Test",
    lastNameEn: "System",
    phone: "0812345678",
    birthDate: "1995-06-15",
    nationalId: randomNationalId(),
    addressLine: "99 หมู่ 1",
    subdistrict: "ในเมือง",
    district: "เมืองร้อยเอ็ด",
    province: "ร้อยเอ็ด",
    postalCode: "45000",
    ...over,
  };
}
