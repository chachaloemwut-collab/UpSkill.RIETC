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

/**
 * Browsers older than the web app's baseline (Next.js 16 + Tailwind CSS 4: Safari/iOS 16.4, Chrome 111,
 * Firefox 128): styles and scripts may partly fail there, so buttons can look fine but not respond.
 * iPadOS can report a desktop "Macintosh" UA; then the Safari "Version/x.y" token is used.
 * Returns a short description for the notice, or null when the browser is supported / unknown.
 */
export function detectOutdatedBrowser(ua: string): { reason: "ios" | "safari" | "chrome" | "firefox"; version: string } | null {
  const ios = ua.match(/(?:iPhone|iPad|iPod).*?OS (\d+)_(\d+)/);
  if (ios) return isBelow(+ios[1]!, +ios[2]!, 16, 4) ? { reason: "ios", version: `${ios[1]}.${ios[2]}` } : null;
  const chrome = ua.match(/(?:Chrome|CriOS)\/(\d+)\./);
  if (chrome && !/Edg\//.test(ua)) return +chrome[1]! < 111 ? { reason: "chrome", version: chrome[1]! } : null;
  const firefox = ua.match(/Firefox\/(\d+)\./);
  if (firefox) return +firefox[1]! < 128 ? { reason: "firefox", version: firefox[1]! } : null;
  const safari = /Safari\//.test(ua) ? ua.match(/Version\/(\d+)\.(\d+)/) : null;
  if (safari) return isBelow(+safari[1]!, +safari[2]!, 16, 4) ? { reason: "safari", version: `${safari[1]}.${safari[2]}` } : null;
  return null;
}

const isBelow = (major: number, minor: number, wantMajor: number, wantMinor: number) => major < wantMajor || (major === wantMajor && minor < wantMinor);
