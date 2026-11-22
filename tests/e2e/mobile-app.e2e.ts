import { chromium } from "playwright";
import { expect, it } from "vitest";
import { BASE, SEED_PASSWORD } from "./helpers.ts";

it("opens the mobile task menu and lets a member navigate into and back from device settings", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.goto(BASE);
    const tasks = page.getByRole("navigation", { name: "งานหลัก", exact: true });
    expect(await tasks.isVisible()).toBe(true);
    await page.getByRole("link", { name: "ดูหน้าเว็บไซต์เต็ม" }).click();
    await page.waitForURL(BASE + "/?view=website");
    await tasks.waitFor({ state: "detached" });
    await page.goto(BASE + "/login");
    await page.getByLabel("อีเมลหรือชื่อผู้ใช้", { exact: true }).fill("learner@upskill.test");
    await page.locator('input[name="password"]').fill(SEED_PASSWORD);
    await Promise.all([page.waitForURL(BASE + "/"), page.locator('input[name="password"]').press("Enter")]);
    await tasks.getByRole("link", { name: "บัญชีของฉัน" }).click();
    const devices = page.locator('.account-task[href="#devices"]');
    await devices.click();
    await page.locator("#devices").waitFor({ state: "visible" });
    expect(await page.locator("#emails").isVisible()).toBe(false);
    await page.goBack();
    await devices.waitFor({ state: "visible" });
    await page.setViewportSize({ width: 1366, height: 960 });
    await page.reload();
    expect(await page.locator("#emails").isVisible()).toBe(true);
    await page.locator("#devices").waitFor({ state: "visible" });
  } finally {
    await browser.close();
  }
});
