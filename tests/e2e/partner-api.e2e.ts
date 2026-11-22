/**
 * Partner (server-to-server) API: key + IP allowlist + scope, lookup by national ID returning training results only,
 * no national ID in responses or logs, revocation takes effect immediately, admin-only key management.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { BASE, Client, SEED_PASSWORD, profileBody, randomNationalId, resetRateLimits, withDb } from "./helpers.ts";

const run = randomBytes(4).toString("hex");
const ALLOWED_IP = "203.0.113.7";
const admin = new Client();
const nationalId = randomNationalId();
let key = "";
let clientId = "";

const call = (path: string, init: { method?: string; body?: unknown; key?: string | null; ip?: string } = {}) =>
  fetch(BASE + path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      ...(init.key === null ? {} : { authorization: `Bearer ${init.key ?? key}` }),
      "x-real-ip": init.ip ?? ALLOWED_IP,
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      "x-request-reference": `e2e-${run}`,
    },
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });

beforeAll(async () => {
  await resetRateLimits();
  await admin.login("admin@upskill.test", SEED_PASSWORD);
  // a member whose national ID the partner already knows
  const reg = await new Client().req("/api/auth/register", {
    body: { email: `partner-${run}@e2e.test`, password: `partner subject ${run}`, profile: profileBody({ nationalId }), pdpaConsent: true },
  });
  expect(reg.status).toBe(200);
});

describe("key management", () => {
  it("is admin-only", async () => {
    const member = new Client();
    await member.login("learner@upskill.test", SEED_PASSWORD);
    expect((await member.req("/api/admin/partner-clients", { body: { name: "x", purpose: "x".repeat(10), allowedIps: [ALLOWED_IP], days: 1 } })).status).toBe(403);
  });

  it("refuses an allowlist that opens the whole internet", async () => {
    const r = await admin.req("/api/admin/partner-clients", { body: { name: `e2e ${run}`, purpose: "ทดสอบระบบตรวจผลการอบรม", allowedIps: ["0.0.0.0/0"], days: 30 } });
    expect(r.json.error).toBe("INVALID_ALLOWLIST");
  });

  it("creates a client and shows the key once (only its hash is stored)", async () => {
    const r = await admin.req("/api/admin/partner-clients", { body: { name: `e2e ${run}`, purpose: "ทดสอบระบบตรวจผลการอบรม", allowedIps: [ALLOWED_IP], days: 30 } });
    expect(r.status).toBe(200);
    key = r.json.key;
    clientId = r.json.id;
    expect(key).toMatch(/^upk_[a-z0-9]{12}_[\w-]{43}$/);
    const stored = await withDb(async (db) => (await db.query("select key_hash from partner_api_clients where id = $1", [clientId])).rows[0]);
    expect(stored.key_hash).not.toContain(key.split("_")[2]);
    const list = await admin.req("/api/admin/partner-clients");
    expect(JSON.stringify(list.json)).not.toContain(key.split("_")[2]);
  });
});

describe("access control", () => {
  it("refuses a missing or wrong key", async () => {
    expect((await call("/api/partner/v1/ping", { key: null })).status).toBe(401);
    expect((await call("/api/partner/v1/ping", { key: `upk_aaaaaaaaaaaa_${"b".repeat(43)}` })).status).toBe(401);
  });

  it("refuses the right key from an IP that is not allowed", async () => {
    const r = await call("/api/partner/v1/ping", { ip: "198.51.100.9" });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toBe("IP_NOT_ALLOWED");
  });

  it("answers ping from the allowed IP, never cached", async () => {
    const r = await call("/api/partner/v1/ping");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(((await r.json()) as { scopes: string[] }).scopes).toEqual(["training:lookup"]);
  });
});

describe("lookup by national ID", () => {
  it("rejects an ID with a wrong check digit", async () => {
    const wrong = nationalId.slice(0, 12) + String((Number(nationalId[12]) + 1) % 10);
    expect((await call("/api/partner/v1/training-records/lookup", { body: { national_id: wrong } })).status).toBe(400);
  });

  it("returns training results for a known person without echoing the ID or contact data", async () => {
    const r = await call("/api/partner/v1/training-records/lookup", { body: { national_id: nationalId } });
    expect(r.status).toBe(200);
    const text = await r.text();
    const json = JSON.parse(text);
    expect(json.found).toBe(true);
    expect(Array.isArray(json.trainings)).toBe(true);
    expect(json.reference).toBe(`e2e-${run}`);
    expect(text).not.toContain(nationalId);
    expect(text).not.toContain(`partner-${run}@e2e.test`);
    expect(text).not.toMatch(/phone|address|email/i);
  });

  it("says not found for a valid ID nobody registered", async () => {
    const r = await call("/api/partner/v1/training-records/lookup", { body: { national_id: randomNationalId() } });
    expect(((await r.json()) as { found: boolean }).found).toBe(false);
  });

  it("takes the ID only in the body (unknown fields rejected)", async () => {
    expect((await call("/api/partner/v1/training-records/lookup", { body: { national_id: nationalId, extra: 1 } })).status).toBe(400);
  });

  it("logs every call without the national ID", async () => {
    const rows = await withDb(async (db) => (await db.query("select * from partner_api_requests where client_id = $1", [clientId])).rows);
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(nationalId);
    expect(rows.some((r) => r.matched === true)).toBe(true);
  });
});

describe("revocation", () => {
  it("stops the key on the next request", async () => {
    expect((await admin.req(`/api/admin/partner-clients/${clientId}/revoke`, { body: {} })).status).toBe(200);
    expect((await call("/api/partner/v1/ping")).status).toBe(401);
  });
});
