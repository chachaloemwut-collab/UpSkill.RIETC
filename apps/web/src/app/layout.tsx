import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { InAppBrowserGate } from "@/components/InAppBrowserGate";
import { Providers } from "@/components/providers";
import { THEME_INIT_SCRIPT } from "@/components/ui/theme-script";
import "./globals.css";

// Self-hosted Thai UI font (SIL OFL). No Google CDN at runtime — the CSP stays closed.
const sarabun = localFont({
  src: [
    { path: "./fonts/Sarabun-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Sarabun-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-sarabun",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: { default: "UpskillReskill.RIETC — เรียนออนไลน์พร้อมใบรับรอง", template: "%s · UpskillReskill.RIETC" },
  applicationName: "UpskillReskill.RIETC",
  description: "เรียนออนไลน์จาก YouTube บันทึกเวลาเรียนจริง และรับใบรับรองที่ตรวจสอบได้",
  icons: { icon: "/favicon.svg" },
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
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // The theme script sets class/data-theme/--radius on <html> before React hydrates
    <html lang="th" suppressHydrationWarning className={sarabun.variable}>
      <head>
        {/* Static constant (no user input), nonce-allowed by the CSP: applies the saved theme before first paint */}
        {/* eslint-disable-next-line react/no-danger */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans">
        <Providers>
          <InAppBrowserGate />
          {children}
        </Providers>
      </body>
    </html>
  );
}
