import type { Metadata, Viewport } from "next";
import { Header } from "@/components/Header";
import { InAppBrowserGate } from "@/components/InAppBrowserGate";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "UpSkill", template: "%s · UpSkill" },
  description: "เรียนออนไลน์จาก YouTube พร้อมใบรับรองที่ตรวจสอบได้",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#15803d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-dvh bg-stone-50 font-sans text-stone-900 antialiased">
        <InAppBrowserGate />
        <Header />
        {children}
      </body>
    </html>
  );
}
