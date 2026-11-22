import { chromium } from "playwright";
import { expect, it } from "vitest";
import { BASE, SEED_PASSWORD } from "./helpers.ts";

it("signs in a learner with Enter from the password field or focused submit button", async () => {
  const browser = await chromium.launch();
  try {
    for (const javaScriptEnabled of [true, false]) {
      for (const tabToSubmit of [false, true]) {
        const context = await browser.newContext({ javaScriptEnabled, reducedMotion: "reduce", serviceWorkers: "block" });
        try {
          const page = await context.newPage();
          await page.goto(`${BASE}/login`);
          const identifier = page.getByLabel("อีเมลหรือชื่อผู้ใช้", { exact: true });
          await identifier.focus();
          await page.keyboard.type("learner@upskill.test");
          await page.keyboard.press("Tab");
          expect(await page.locator(":focus").getAttribute("name")).toBe("password");
          await page.keyboard.type(SEED_PASSWORD);
          if (tabToSubmit) {
            await page.keyboard.press("Tab");
            expect(await page.locator(":focus").getAttribute("type")).toBe("submit");
          }
          await Promise.all([page.waitForURL(`${BASE}/`), page.keyboard.press("Enter")]);
          expect((await context.request.get(`${BASE}/me`, { maxRedirects: 0 })).status()).toBe(200);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
});
