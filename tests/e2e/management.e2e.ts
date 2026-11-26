import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { Client, SEED_PASSWORD, withDb } from "./helpers.ts";

it("limits course exports to the delegated course and applies withdrawal to an open session", async () => {
  const email = `management-${randomUUID()}@example.test`;
  const fixture = await withDb(async db => {
    const target = await db.query(
      "INSERT INTO users(email,password_hash,role,status,email_verified_at) SELECT $1,password_hash,'member','active',now() FROM users WHERE email='learner@upskill.test' RETURNING id",
      [email],
    );
    const course = (await db.query("SELECT id FROM courses ORDER BY id LIMIT 1")).rows[0].id;
    const grant = await db.query(
      "INSERT INTO management_grants(user_id,duty,course_id,can_export,reason,granted_by) SELECT $1,'academic',$2,true,'E2E',id FROM users WHERE email='admin@upskill.test' RETURNING id,granted_by",
      [target.rows[0].id, course],
    );
    return {course, ...grant.rows[0]};
  });
  const client = new Client();
  await client.login(email, SEED_PASSWORD);
  const path = "/api/management/export?resource=courses";
  const exported = await client.req(path);
  expect(exported.status).toBe(200);
  expect(exported.text.trim().split("\r\n")).toHaveLength(2);
  expect(exported.text).toContain(fixture.course);
  expect((await client.req("/api/management/export?resource=payments")).status).toBe(403);
  await withDb(db => db.query("UPDATE management_grants SET revoked_at=now(),revoked_by=$2 WHERE id=$1", [fixture.id,fixture.granted_by]));
  expect((await client.req(path)).status).toBe(403);
});
