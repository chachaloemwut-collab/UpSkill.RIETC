import { chromium } from "playwright";
import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { BASE, withDb } from "./helpers.ts";

it("accepts a learner without a session or JavaScript and gives a private tracking receipt", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ javaScriptEnabled:false });
    await page.goto(BASE+"/recovery");
    const contact = "case-"+randomUUID()+"@e2e.test";
    await page.getByLabel("อีเมลหรือเบอร์โทรศัพท์ที่ติดต่อได้").fill(contact);
    await page.getByRole("button",{name:"ส่งเรื่องให้ทะเบียน"}).click();
    const codes = page.locator("code");
    await codes.first().waitFor();
    const [ref,secret] = await codes.allTextContents();
    expect(ref).toMatch(/^[0-9a-f-]{36}$/);
    expect(secret).toHaveLength(43);
    const stored = await withDb(async c=>(await c.query("SELECT contact, tracking_hash FROM recovery_cases WHERE id=$1",[ref])).rows[0]);
    expect(stored.contact).not.toContain(contact);
    expect(stored.tracking_hash).not.toContain(secret);
    await page.getByLabel("เลขเรื่อง",{exact:true}).fill(ref!);
    await page.getByLabel("รหัสติดตาม",{exact:true}).fill(secret!);
    await page.getByRole("button",{name:"ตรวจสอบสถานะ"}).click();
    await page.getByText("รับเรื่องแล้ว",{exact:true}).waitFor();
    expect(page.url()).not.toContain(secret!);
    expect(await page.locator("body").innerText()).not.toContain(contact);
  } finally { await browser.close(); }
});

it("hands an existing learner back to the same account after independent registrar review and approval", async () => {
  const { Client, SEED_PASSWORD } = await import("./helpers.ts");
  const ref = randomUUID();
  const setup = await withDb(async c => {
    const ids: Record<string,string> = {};
    for (const duty of ["registrar","approver","learner"]) {
      const email = duty+"-"+ref+"@e2e.test";
      const row = await c.query("insert into users(email,password_hash,role,email_verified_at) select $1,password_hash,$2::varchar,case when $2::varchar = 'admin' then now() end from users where email='admin@upskill.test' returning id",[email,duty === "learner" ? "member" : "admin"]);
      ids[duty]=row.rows[0].id;
      if (duty !== "learner") await c.query("insert into recovery_staff(user_id,duty,delegated_by) values ($1,$2,$1)",[ids[duty],duty]);
    }
    return ids;
  });
  const browser = await chromium.launch();
  try {
    const intake = await browser.newPage();
    await intake.goto(BASE+"/recovery");
    await intake.getByLabel("อีเมลหรือเบอร์โทรศัพท์ที่ติดต่อได้").fill("contact-"+ref+"@e2e.test");
    await intake.getByRole("button",{name:"ส่งเรื่องให้ทะเบียน"}).click();
    await intake.locator("code").first().waitFor();
    const caseId = (await intake.locator("code").first().textContent())!;
    async function staff(duty:string) {
      const client = new Client();
      await client.login(duty+"-"+ref+"@e2e.test",SEED_PASSWORD);
      const context = await browser.newContext();
      await context.addCookies([...client.cookies].map(([name,value])=>({name,value,url:BASE})));
      const page = await context.newPage();
      await page.goto(BASE+"/admin/recovery");
      return {page,card:page.locator("article").filter({hasText:caseId})};
    }
    const registrar = await staff("registrar");
    await registrar.card.getByRole("button",{name:"รับดำเนินการ"}).click();
    await registrar.card.locator('input[name="target"]').fill(setup["learner"]!);
    await registrar.card.locator('select[name="proof"]').selectOption("in_person");
    await registrar.card.getByRole("button",{name:"ยืนยันผลตรวจและส่งขออนุมัติ"}).click();
    await registrar.card.getByText(/รอตรวจอนุมัติ/).first().waitFor();
    expect(await registrar.card.getByRole("button",{name:"อนุมัติให้ทะเบียนออกลิงก์"}).count()).toBe(0);
    const approver = await staff("approver");
    await approver.card.getByRole("button",{name:"อนุมัติให้ทะเบียนออกลิงก์"}).click();
    await approver.card.getByText(/ตรวจอนุมัติแล้ว/).first().waitFor();
    await registrar.page.reload();
    await registrar.card.getByRole("button",{name:"ออกลิงก์ใช้ครั้งเดียว"}).click();
    const result = registrar.card.getByRole("status");
    await result.waitFor();
    const link = (await result.textContent())!.match(/https?:\/\/\S+$/)![0];
    const password = "regained "+ref;
    const plain = await browser.newPage({javaScriptEnabled:false});
    await plain.goto(link);
    await plain.locator('[name="password"]').fill(password);
    await plain.locator('[name="confirm"]').fill(password);
    await plain.getByRole("button",{name:"ตั้งรหัสผ่านใหม่",exact:true}).click();
    await plain.waitForURL(BASE+"/login?reset=1");
    const learner = new Client();
    await learner.login("learner-"+ref+"@e2e.test",password);
    const row = await withDb(async c=>(await c.query("select r.status, u.id, u.email_verified_at from recovery_cases r join users u on u.id=r.target_user_id where r.id=$1",[caseId])).rows[0]);
    expect(row).toEqual({status:"recovered",id:setup["learner"],email_verified_at:null});
    const identifier = "learner-"+ref+"@e2e.test";
    expect((await new Client().req("/api/auth/forgot-password",{body:{email:identifier}})).status).toBe(200);
    const retired = await withDb(async c=>(await c.query("select count(*)::int as total from password_reset_tokens where user_id=$1 and reset_method='email_link'",[setup["learner"]])).rows[0]);
    expect(retired.total).toBe(0);
  } finally {await browser.close();}
});
