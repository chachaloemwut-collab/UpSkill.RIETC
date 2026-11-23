/**
 * Password recovery on a live system: self-service by username, and the admin tools
 * (emailed link, hand-over link, temporary password that must be replaced, login unlock).
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { BASE, Client, SEED_PASSWORD, profileBody, resetRateLimits, waitForEmailLink, withDb } from "./helpers.ts";

const run = randomBytes(4).toString("hex");
const email = `pw-${run}@e2e.test`;
const username = `pw${run}`;
const admin = new Client();
let userId = "";

beforeAll(async () => {
  await resetRateLimits();
  if (!(await fetch(BASE).catch(() => null))) throw new Error(`web app not reachable at ${BASE}`);
  await admin.login("admin@upskill.test", SEED_PASSWORD);
  const reg = await new Client().req("/api/auth/register", { body: { email, password: `first password ${run}`, profile: profileBody(), pdpaConsent: true } });
  expect(reg.status).toBe(200);
  const link = await waitForEmailLink(email, "/verify-email");
  const token = new URL(link).searchParams.get("token");
  expect((await new Client().req("/api/auth/verify-email", { body: { token } })).status).toBe(200);
  userId = await withDb(async (c) => {
    await c.query("UPDATE users SET username = $1 WHERE email = $2", [username, email]);
    return (await c.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email])).rows[0]!.id;
  });
});

describe("self-service", () => {
  it("opens a manually pasted admin recovery link from the public recovery page", async () => {
    const response = await admin.req(`/api/admin/users/${userId}/reset-link`, { body: {} });
    expect(response.status).toBe(200);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(BASE + "/forgot-password");
      await page.getByText("มีลิงก์แล้วแต่กดเปิดไม่ได้", { exact: true }).click();
      await page.locator('input[name="recovery"]').fill(response.json.link);
      await page.getByRole("button", { name: "เปิดหน้าตั้งรหัสผ่าน" }).click();
      await page.locator('input[name="password"]').waitFor();
      expect(new URL(page.url()).pathname).toBe("/reset-password");
    } finally { await browser.close(); }
  });

  it("forgot-password accepts a username and mails the account's address", async () => {
    expect((await new Client().req("/api/auth/forgot-password", { body: { email: username } })).status).toBe(200);
    const link = await waitForEmailLink(email, "/reset-password");
    expect(new URL(link).searchParams.get("token")).toMatch(/^[A-Za-z0-9_-]{40,64}$/);
  });

  it("never sends a reset for the protected owner account", async () => {
    const r = await new Client().req("/api/auth/forgot-password", { body: { email: "superadmin" } });
    expect(r.status).toBe(200);
    const n = await withDb(async (c) =>
      (await c.query<{ n: number }>("SELECT count(*)::int AS n FROM password_reset_tokens t JOIN users u ON u.id = t.user_id WHERE u.is_system_owner AND t.created_at > now() - interval '1 minute'")).rows[0]!.n,
    );
    expect(n).toBe(0);
  });

  it("a signed-in user who forgot the current password can mail themselves a link", async () => {
    const member = new Client();
    await member.login(email, `first password ${run}`);
    const r = await member.req("/api/user/password/reset-link", { body: {} });
    expect(r.status).toBe(200);
    expect(r.json.email).toBe(email);
    expect((await new Client().req("/api/user/password/reset-link", { body: {} })).status).toBe(401);
  });

  it("the reset page says a dead link is dead before asking for a password", async () => {
    const link = await waitForEmailLink(email, "/reset-password");
    const live = await new Client().req(new URL(link).pathname + new URL(link).search);
    expect(live.text).toContain('name="confirm"');
    const dead = await new Client().req(`/reset-password?token=${randomBytes(32).toString("base64url")}`);
    expect(dead.text).toContain("ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว");
    expect(dead.text).not.toContain('name="confirm"');
  });
});

describe("admin tools", () => {
  it("members cannot use them", async () => {
    const member = new Client();
    await member.login(email, `first password ${run}`);
    expect((await member.req(`/api/admin/users/${userId}/reset-link`, { body: {} })).status).toBe(403);
  });

  it("refuses the protected owner account", async () => {
    const ownerId = await withDb(async (c) => (await c.query<{ id: string }>("SELECT id FROM users WHERE is_system_owner LIMIT 1")).rows[0]?.id);
    if (!ownerId) return;
    const r = await admin.req(`/api/admin/users/${ownerId}/temporary-password`, { body: {} });
    expect(r.json.error).toBe("SYSTEM_OWNER_PROTECTED");
  });

  it("emails a reset link without signing the user out", async () => {
    const r = await admin.req(`/api/admin/users/${userId}/reset-password`, { body: { logout: false } });
    expect(r.status).toBe(200);
    expect(r.json.sentTo).toBe(email);
  });

  it("creates a single-use hand-over link", async () => {
    const r = await admin.req(`/api/admin/users/${userId}/reset-link`, { body: {} });
    expect(r.status).toBe(200);
    const token = new URL(r.json.link).searchParams.get("token");
    const newPassword = `handed over link ${run}`;
    expect((await new Client().req("/api/auth/reset-password", { body: { token, new_password: newPassword } })).status).toBe(200);
    expect((await new Client().req("/api/auth/reset-password", { body: { token, new_password: newPassword } })).json.error).toBe("INVALID_OR_EXPIRED_TOKEN");
    await new Client().login(email, newPassword);
  });

  it("sets a temporary password that must be replaced before any session exists", async () => {
    const r = await admin.req(`/api/admin/users/${userId}/temporary-password`, { body: {} });
    expect(r.status).toBe(200);
    const temp = r.json.password as string;
    expect(temp).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);

    const c = new Client();
    const login = await c.req("/api/auth/login", { body: { email: username, password: temp } });
    expect(login.status).toBe(200);
    expect(login.json.redirectTo).toMatch(/^\/reset-password\?token=.+&required=1$/);
    // No session was created: protected APIs still say unauthenticated
    expect((await c.req("/api/user/profile")).status).toBe(401);

    const token = new URL(login.json.redirectTo, BASE).searchParams.get("token");
    const mine = `my own password ${run}`;
    expect((await new Client().req("/api/auth/reset-password", { body: { token, new_password: mine } })).status).toBe(200);
    const after = await new Client().login(username, mine);
    expect(after.json.redirectTo).toBe("/");
    const flag = await withDb(async (db) => (await db.query<{ m: boolean }>("SELECT must_change_password AS m FROM users WHERE id = $1", [userId])).rows[0]!.m);
    expect(flag).toBe(false);
  });

  it("rejects a weak admin-chosen temporary password", async () => {
    const r = await admin.req(`/api/admin/users/${userId}/temporary-password`, { body: { password: "short" } });
    expect(r.json.error).toBe("WEAK_PASSWORD");
  });

  it("unlocks a throttled login", async () => {
    for (let i = 0; i < 21; i++) await new Client().req("/api/auth/login", { body: { email: username, password: "wrong password here" } });
    expect((await new Client().req("/api/auth/login", { body: { email: username, password: "wrong password here" } })).status).toBe(429);
    expect((await admin.req(`/api/admin/users/${userId}/unlock-login`, { body: {} })).status).toBe(200);
    expect((await new Client().req("/api/auth/login", { body: { email: username, password: "wrong password here" } })).status).toBe(401);
  });
});
