import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import { headers } from "next/headers";
import { InAppBrowserGate } from "@/components/InAppBrowserGate";
import { Providers } from "@/components/providers";
import { THEME_INIT_SCRIPT } from "@/components/ui/theme-script";
import "./globals.css";

// next/font downloads the files at build time and serves them from our origin: no Google request at runtime
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const notoThai = Noto_Sans_Thai({ subsets: ["thai"], weight: ["400", "500", "600", "700"], variable: "--font-noto-thai", display: "swap" });

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
    <html lang="th" className={`${inter.variable} ${notoThai.variable}`} suppressHydrationWarning>
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
