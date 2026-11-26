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
    await page.setViewportSize({ width: 320, height: 700 });
    for (const path of ["/courses", "/my-courses", "/certificates", "/programs", "/me"]) {
      const response = await page.goto(BASE + path);
      expect(response?.status(), path).toBe(200);
      expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), path).toBe(true);
    }
    await page.goto(BASE + "/me/profile");
    const phone = page.getByLabel("เบอร์โทรศัพท์มือถือ", { exact: true });
    await phone.waitFor({ state: "visible" });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
      await phone.focus();
      expect(await page.evaluate("parseFloat(getComputedStyle(document.activeElement).fontSize)")).toBeGreaterThanOrEqual(16);
    }
    await phone.fill("0812345678");
    await page.context().setOffline(true);
    await page.getByText("ไม่มีการเชื่อมต่ออินเทอร์เน็ต", { exact: true }).waitFor();
    await page.getByRole("button", { name: "บันทึกข้อมูล" }).click();
    await page.getByText("ยังไม่ได้ส่งข้อมูล", { exact: true }).waitFor();
    expect(await phone.inputValue()).toBe("0812345678");
    await page.context().setOffline(false);
    await page.getByText("ไม่มีการเชื่อมต่ออินเทอร์เน็ต", { exact: true }).waitFor({ state: "hidden" });
    expect(await phone.inputValue()).toBe("0812345678");
    await page.goto(BASE + "/me");
    await page.setViewportSize({ width: 1366, height: 960 });
    await page.reload();
    // React may briefly stage streamed markup outside the active main landmark.
    const account = page.getByRole("main");
    await account.locator("#emails").waitFor({ state: "visible" });
    await account.locator("#devices").waitFor({ state: "visible" });
  } finally {
    await browser.close();
  }
});
