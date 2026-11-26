// Regression tests for the CREATE-ONLY system owner bootstrap (docs/AI_COLLABORATION.md):
// the deployment secret must never overwrite an existing account's password, promote a
// username collision, or change role/status/session at startup.
// Runs against a throwaway database created from DATABASE_MIGRATION_URL (owner role).
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createDb, sql } from "@upskill/db";
import type { Env } from "@upskill/infra/env";
import { hashPassword, verifyPassword } from "@upskill/infra/password";
import { ensureSystemOwner } from "./system-owner.ts";

const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? "postgres://upskill_owner:dev_owner_password@127.0.0.1:55432/upskill";
const TEST_DB = "upskill_system_owner_test";
function databaseUrl(name: string) {
  const url = new URL(MIGRATION_URL);
  url.pathname = "/" + name;
  return url.href;
}
const testUrl = databaseUrl(TEST_DB);
const adminUrl = databaseUrl("postgres");

const db = createDb(testUrl);
const admin = createDb(adminUrl);

const PASSWORD_A = "Owner-Boot-A-123456";
const PASSWORD_B = "Owner-Boot-B-654321";
const env = (username: string, password?: string) => ({ SYSTEM_OWNER_USERNAME: username, SYSTEM_OWNER_PASSWORD: password ?? "" } as unknown as Env);

const ownerRow = async () =>
  db.selectFrom("users").select(["id", "username", "email", "role", "status", "is_system_owner", "password_hash"]).where("is_system_owner", "=", true).executeTakeFirst();

before(async () => {
  await sql`DROP DATABASE IF EXISTS ${sql.ref(TEST_DB)} WITH (FORCE)`.execute(admin);
  await sql`CREATE DATABASE ${sql.ref(TEST_DB)}`.execute(admin);
  const dir = fileURLToPath(new URL("../../../packages/db/migrations/", import.meta.url));
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  for (const file of files) {
    await sql`${sql.raw(await readFile(dir + file, "utf8"))}`.execute(db);
  }
});

beforeEach(async () => {
  await sql`TRUNCATE users CASCADE`.execute(db);
});

after(async () => {
  // Close the test pool BEFORE dropping the database, or the forced drop terminates
  // its idle connection and surfaces as an uncaughtException after the tests.
  await db.destroy();
  await sql`DROP DATABASE IF EXISTS ${sql.ref(TEST_DB)} WITH (FORCE)`.execute(admin);
  await admin.destroy();
});

describe("ensureSystemOwner (CREATE-ONLY bootstrap)", () => {
  it("bootstraps the protected owner when no owner exists", async () => {
    await ensureSystemOwner(db, env("testowner", PASSWORD_A));
    const owner = await ownerRow();
    assert.ok(owner);
    assert.equal(owner.username, "testowner");
    assert.equal(owner.is_system_owner, true);
    assert.equal(owner.role, "admin");
    assert.equal(owner.status, "active");
    assert.equal(owner.email, "system-owner@internal.invalid");
    assert.ok(await verifyPassword(owner.password_hash, PASSWORD_A));
  });

  it("never overwrites an existing owner's password when the env secret differs", async () => {
    await ensureSystemOwner(db, env("testowner", PASSWORD_A));
    await ensureSystemOwner(db, env("testowner", PASSWORD_B)); // startup with a rotated secret
    const owner = await ownerRow();
    assert.ok(owner);
    assert.ok(await verifyPassword(owner.password_hash, PASSWORD_A), "original password must still work");
    assert.ok(!(await verifyPassword(owner.password_hash, PASSWORD_B)), "env secret must NOT have been synced over the account");
  });

  it("never promotes a user that already holds the configured username", async () => {
    await sql`INSERT INTO users (email, username, password_hash, password_updated_at) VALUES ('member@test.local', 'testowner', ${await hashPassword(PASSWORD_A)}, now())`.execute(db);
    await ensureSystemOwner(db, env("testowner", PASSWORD_B));
    const member = await db.selectFrom("users").select(["id", "role", "status", "is_system_owner", "password_hash"]).where("username", "=", "testowner").executeTakeFirstOrThrow();
    assert.equal(member.is_system_owner, false, "username collision must not be promoted");
    assert.equal(member.role, "member", "role must not change");
    assert.equal(member.status, "active");
    assert.ok(await verifyPassword(member.password_hash, PASSWORD_A), "collision account password must not change");
    const owners = await db.selectFrom("users").select(sql<number>`count(*)::int`.as("n")).where("is_system_owner", "=", true).executeTakeFirstOrThrow();
    assert.equal(owners.n, 0, "no owner may be created while the username is taken by a regular account");
  });

  it("skips cleanly when the bootstrap password is not set", async () => {
    await ensureSystemOwner(db, env("testowner"));
    const owners = await db.selectFrom("users").select(sql<number>`count(*)::int`.as("n")).where("is_system_owner", "=", true).executeTakeFirstOrThrow();
    assert.equal(owners.n, 0);
  });

  it("leaves the owner untouched (no throw) when the configured username differs", async () => {
    await ensureSystemOwner(db, env("ownerx", PASSWORD_A));
    await ensureSystemOwner(db, env("ownery", PASSWORD_B)); // must not throw or modify anything
    const owner = await db.selectFrom("users").select(["username", "password_hash"]).where("is_system_owner", "=", true).executeTakeFirstOrThrow();
    assert.equal(owner.username, "ownerx");
    assert.ok(await verifyPassword(owner.password_hash, PASSWORD_A));
    const stray = await db.selectFrom("users").select(sql<number>`count(*)::int`.as("n")).where("username", "=", "ownery").executeTakeFirstOrThrow();
    assert.equal(stray.n, 0);
  });

  it("is idempotent on repeated startups with the same secret", async () => {
    await ensureSystemOwner(db, env("testowner", PASSWORD_A));
    await ensureSystemOwner(db, env("testowner", PASSWORD_A));
    await ensureSystemOwner(db, env("testowner", PASSWORD_A));
    const owners = await db.selectFrom("users").select(sql<number>`count(*)::int`.as("n")).where("is_system_owner", "=", true).executeTakeFirstOrThrow();
    assert.equal(owners.n, 1);
    const owner = await ownerRow();
    assert.ok(owner);
    assert.ok(await verifyPassword(owner.password_hash, PASSWORD_A));
  });
});
