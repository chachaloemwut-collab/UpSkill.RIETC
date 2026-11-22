import { chromium } from "playwright";
import { expect, it } from "vitest";
import { BASE, Client, SEED_PASSWORD, withDb } from "./helpers.ts";

it("streams the certificate skeleton while the register is still waiting for data", async () => {
  const admin = new Client();
  await admin.login("admin@upskill.test", SEED_PASSWORD);
  const cookie = [...admin.cookies].map(([key, value]) => key + "=" + value).join("; ");
  await withDb(async db => {
    await db.query("BEGIN");
    try {
      // This suite runs serially against the test database. Hold a reader until the fallback arrives.
      await db.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
      await db.query("LOCK TABLE certificates IN ACCESS EXCLUSIVE MODE");
      const response = await fetch(BASE + "/admin/certificates", { headers: { cookie }, signal: AbortSignal.timeout(10000) });
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let html = "";
      while (!html.includes("กำลังโหลดทะเบียนวุฒิบัตร")) {
        const chunk = await reader.read();
        if (chunk.done) break;
        html += decoder.decode(chunk.value, { stream: true });
      }
      expect(html).toContain("กำลังโหลดทะเบียนวุฒิบัตร");
      await db.query("ROLLBACK");
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        html += decoder.decode(chunk.value, { stream: true });
      }
      expect(html).toContain("ถูกเพิกถอน");
    } finally {
      await db.query("ROLLBACK");
    }
  });
});

it("shows navigation feedback before an uncached mobile route responds and clears it on arrival", async () => {
  const browser = await chromium.launch();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    await page.route("**/courses?*", async route => {
      if (route.request().headers().rsc === "1") await gate;
      await route.continue();
    });
    await page.goto(BASE);
    await page.getByRole("link", { name: "ค้นหาหลักสูตร", exact: true }).click();
    const loading = page.getByRole("status", { name: "กำลังเปิดหน้า", exact: true });
    await loading.waitFor({ state: "visible", timeout: 6000 });
    release();
    await page.waitForURL(BASE + "/courses");
    await page.getByRole("heading", { name: "คลังหลักสูตร" }).waitFor();
    await loading.waitFor({ state: "hidden" });
  } finally {
    release();
    await browser.close();
  }
});
