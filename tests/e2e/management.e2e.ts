import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { BASE, Client, SEED_PASSWORD, withDb } from "./helpers.ts";

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

it("pins a notice from a mobile staff form and respects withdrawal before the next submission", async () => {
  const slug = "notice-" + randomUUID();
  const email = slug + "@example.test";
  const fixture = await withDb(async db => {
    const account = await db.query("INSERT INTO users(email,password_hash,role,status,email_verified_at) SELECT $1,password_hash,'member','active',now() FROM users WHERE email='learner@upskill.test' RETURNING id",[email]);
    const grant = await db.query("INSERT INTO management_grants(user_id,duty,can_act,reason,granted_by) SELECT $1,'support',true,'E2E',id FROM users WHERE email='admin@upskill.test' RETURNING id,granted_by",[account.rows[0].id]);
    const notice = await db.query("INSERT INTO announcements(slug,title,body,created_by) VALUES($1,$1,'E2E',$2) RETURNING id",[slug,grant.rows[0].granted_by]);
    return {grant:grant.rows[0], notice:notice.rows[0].id};
  });
  const client = new Client();
  await client.login(email,SEED_PASSWORD);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:320,height:700},hasTouch:true});
    await page.context().addCookies([...client.cookies].map(([name,value])=>({name,value,url:BASE})));
    await page.goto(BASE+"/management?resource=announcements");
    await page.getByLabel("ค้นหา",{exact:true}).fill(slug);
    await page.getByRole("button",{name:"แสดงผล"}).click();
    await page.waitForURL(url=>url.searchParams.has("direction"));
    const row = page.locator("tbody tr").filter({hasText:slug});
    await row.waitFor();
    expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    const open = async () => {
      const select = row.getByLabel("ผลการพิจารณา");
      if (!await select.isVisible()) await row.locator("summary").click();
      return select;
    };
    await (await open()).selectOption("pin");
    await row.getByLabel("เหตุผล").fill("ทดสอบการปักหมุด");
    await row.getByRole("button",{name:"ยืนยันการบันทึก"}).click();
    await row.getByText("บันทึกผลแล้ว",{exact:true}).waitFor();
    await (await open()).selectOption("unpin");
    await row.getByLabel("เหตุผล").fill("ทดสอบสิทธิ์หลังถอน");
    await withDb(db=>db.query("UPDATE management_grants SET revoked_at=now(),revoked_by=$2 WHERE id=$1",[fixture.grant.id,fixture.grant.granted_by]));
    await row.getByRole("button",{name:"ยืนยันการบันทึก"}).click();
    await page.getByText("สิทธิ์ของคุณไม่ครอบคลุมรายการนี้",{exact:true}).waitFor();
    const result = await withDb(db=>db.query("SELECT is_pinned FROM announcements WHERE id=$1",[fixture.notice]));
    expect(result.rows[0].is_pinned).toBe(true);
  } finally {
    await browser.close();
  }
});
