/** In-app browser (WebView) detection, spec 3.1 #1. Used on both client and server (SSR). */

export type InAppApp = "line" | "facebook" | "messenger" | "instagram" | "tiktok" | "wechat" | "android-webview";
export type OS = "ios" | "android" | "other";

export interface InAppInfo {
  inApp: boolean;
  app?: InAppApp;
  os: OS;
}

const RULES: Array<[InAppApp, RegExp]> = [
  ["line", /\bLine\//i],
  ["messenger", /\bFB_IAB\/MESSENGER|\bFBAN\/Messenger/i],
  ["facebook", /\bFBAN\/|\bFBAV\/|\bFB_IAB\//],
  ["instagram", /\bInstagram\b/],
  ["tiktok", /BytedanceWebview|musical_ly|\bTikTok\b/i],
  ["wechat", /MicroMessenger/i],
  // Generic Android WebView: "; wv)" in the UA
  ["android-webview", /;\s?wv\)/],
];

export function detectInAppBrowser(ua: string): InAppInfo {
  const os: OS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua)) ? "ios" : /Android/.test(ua) ? "android" : "other";
  for (const [app, re] of RULES) if (re.test(ua)) return { inApp: true, app, os };
  return { inApp: false, os };
}

/** URL that opens in an external browser. Returns null if there's no reliable method (iOS: use "copy link" instead). */
export function externalBrowserUrl(currentUrl: string, info: InAppInfo): string | null {
  const url = new URL(currentUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (info.app === "line") {
    // LINE supports this parameter officially and opens the device's default browser
    url.searchParams.set("openExternalBrowser", "1");
    return url.toString();
  }
  if (info.os === "android") {
    const rest = `${url.host}${url.pathname}${url.search}${url.hash}`;
    return `intent://${rest}#Intent;scheme=${url.protocol.slice(0, -1)};package=com.android.chrome;end`;
  }
  return null;
}
