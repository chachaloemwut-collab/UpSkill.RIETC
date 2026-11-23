import { createHash, randomBytes } from "node:crypto";
import { Redis } from "ioredis";
import { expect, it } from "vitest";
import { Client, REDIS, profileBody, resetRateLimits, withDb } from "./helpers.ts";

it("requires a verified Google handoff, consent and a unique national ID before creating a member", async () => {
  await resetRateLimits();
  const client = new Client();
  const profile = { ...profileBody(), pdpaConsent: true };
  const endpoint = "/api/auth/google/register";
  expect((await client.req(endpoint, { body: profile })).status).toBe(401);

  // Stand in for the verified provider callback in CI. The browser only holds the opaque cookie.
  const redis = new Redis(REDIS);
  async function verifiedHandoff(browser: Client) {
    const token = randomBytes(32).toString("base64url");
    const sub = randomBytes(12).toString("hex");
    const email = sub + "@e2e.test";
    await redis.set("google-signup:" + createHash("sha256").update(token).digest("hex"), JSON.stringify({ sub, email }), "EX", 60);
    browser.cookies.set("google_signup", token);
    return email;
  }
  try {
    const email = await verifiedHandoff(client);
    const count = (address: string) => withDb(async c => (await c.query("select count(*)::int as n from users where email=$1", [address])).rows[0].n);
    expect((await client.req("/register/google")).text).toContain("กรอกข้อมูลเพื่อสมัครสมาชิก");
    expect((await client.req(endpoint, { body: { ...profile, nationalId: "" } })).status).toBe(400);
    expect((await client.req(endpoint, { body: { ...profile, pdpaConsent: false } })).status).toBe(400);
    expect(await count(email)).toBe(0);
    expect((await client.req(endpoint, { body: profile })).status).toBe(200);
    expect(await count(email)).toBe(1);
    const saved = await client.req("/api/user/profile");
    expect(saved.json.profile.national_id_last4).toBe(profile.nationalId.slice(-4));
    expect(JSON.stringify(saved.json)).not.toContain(profile.nationalId);
    const duplicate = new Client();
    const secondEmail = await verifiedHandoff(duplicate);
    await resetRateLimits();
    expect((await duplicate.req(endpoint, { body: profile })).json.error).toBe("NATIONAL_ID_IN_USE");
    expect(await count(secondEmail)).toBe(0);
  } finally { await redis.quit(); }
});
