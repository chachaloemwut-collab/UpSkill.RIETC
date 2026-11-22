import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { InAppBrowserGate } from "@/components/InAppBrowserGate";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { Providers } from "@/components/providers";
import { THEME_INIT_SCRIPT } from "@/components/ui/theme-script";
import { detectOutdatedBrowser } from "@upskill/core/user-agent";
import "./globals.css";

// Self-hosted fonts (SIL OFL). No Google CDN at runtime — the CSP stays closed.
const prompt = localFont({
  src: [
    { path: "./fonts/Prompt-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Prompt-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Prompt-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/Prompt-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-prompt",
  display: "swap",
  preload: true,
});

const sarabun = localFont({
  src: [
    { path: "./fonts/Sarabun-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Sarabun-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Sarabun-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/Sarabun-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-sarabun",
  display: "swap",
  preload: true,
});

const jetbrainsMono = localFont({
  src: [
    { path: "./fonts/JetBrainsMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/JetBrainsMono-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/JetBrainsMono-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/JetBrainsMono-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "UpskillReskill.RIETC — เรียนออนไลน์พร้อมวุฒิบัตร", template: "%s · UpskillReskill.RIETC" },
  applicationName: "UpskillReskill.RIETC",
  description: "เรียนออนไลน์จาก YouTube บันทึกเวลาเรียนจริง และรับวุฒิบัตรที่ตรวจสอบได้",
  icons: { icon: "/favicon.svg", apple: "/icons/apple-touch-icon.png" },
  // iPhone/iPad "Add to Home Screen" opens full screen with this title
  appleWebApp: { capable: true, title: "UpSkill RIETC", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const nonce = h.get("x-nonce") ?? undefined;
  const outdated = detectOutdatedBrowser(h.get("user-agent") ?? "");
  return (
    // The theme script sets class/data-theme/--radius on <html> before React hydrates
    <html lang="th" suppressHydrationWarning className={`${prompt.variable} ${sarabun.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Static constant (no user input), nonce-allowed by the CSP: applies the saved theme before first paint */}
        {/* eslint-disable-next-line react/no-danger */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-reading">
        {outdated && (
          // Inline styles on purpose: on these browsers the app's CSS may not apply
          <div role="status" style={{ background: "#fff7ed", color: "#9a3412", borderBottom: "1px solid #fdba74", padding: "10px 16px", fontSize: "14px", lineHeight: 1.5, textAlign: "center" }}>
            {outdated.reason === "ios"
              ? `อุปกรณ์นี้ใช้ iOS/iPadOS ${outdated.version} ซึ่งเก่าเกินไป บางปุ่มอาจกดไม่ได้ กรุณาอัปเดตเป็น iOS/iPadOS 16.4 ขึ้นไป`
              : `เบราว์เซอร์นี้เป็นรุ่นเก่า (${outdated.version}) บางปุ่มอาจกดไม่ได้ กรุณาอัปเดตเบราว์เซอร์หรือใช้ Chrome/Safari รุ่นล่าสุด`}
            {" "}— หน้าเข้าสู่ระบบยังใช้งานได้
          </div>
        )}
        <Providers>
          <InAppBrowserGate />
          <ServiceWorkerRegistrar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
