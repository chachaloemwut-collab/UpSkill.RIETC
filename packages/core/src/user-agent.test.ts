import { describe, expect, it } from "vitest";
import { detectInAppBrowser, externalBrowserUrl } from "./user-agent.js";

const UA = {
  lineIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0",
  fbAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0;]",
  igIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0",
  tiktok:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 BytedanceWebview/d8a21c6",
  safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  chromeDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

describe("detectInAppBrowser", () => {
  it("detects LINE on iOS", () => expect(detectInAppBrowser(UA.lineIos)).toEqual({ inApp: true, app: "line", os: "ios" }));
  it("detects Facebook on Android", () => expect(detectInAppBrowser(UA.fbAndroid)).toMatchObject({ inApp: true, app: "facebook", os: "android" }));
  it("detects Instagram", () => expect(detectInAppBrowser(UA.igIos)).toMatchObject({ app: "instagram" }));
  it("detects TikTok", () => expect(detectInAppBrowser(UA.tiktok)).toMatchObject({ app: "tiktok" }));
  it("passes real Safari", () => expect(detectInAppBrowser(UA.safari).inApp).toBe(false));
  it("passes desktop Chrome", () => expect(detectInAppBrowser(UA.chromeDesktop).inApp).toBe(false));
});

describe("externalBrowserUrl", () => {
  it("uses openExternalBrowser for LINE", () => {
    expect(externalBrowserUrl("https://x.test/a?b=1", detectInAppBrowser(UA.lineIos))).toBe("https://x.test/a?b=1&openExternalBrowser=1");
  });
  it("uses a Chrome intent on Android", () => {
    expect(externalBrowserUrl("https://x.test/a", detectInAppBrowser(UA.fbAndroid))).toBe(
      "intent://x.test/a#Intent;scheme=https;package=com.android.chrome;end",
    );
  });
  it("returns null on iOS non-LINE (show copy-link instead)", () => {
    expect(externalBrowserUrl("https://x.test/a", detectInAppBrowser(UA.igIos))).toBeNull();
  });
});
