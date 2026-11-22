import type { MetadataRoute } from "next";

// Installable web app (PWA): Android/desktop install prompt and "Add to Home Screen" on iPhone/iPad
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "UpskillReskill.RIETC · วิทยาลัยเทคนิคนิคมอุตสาหกรรมระยอง",
    short_name: "UpskillReskill.RIETC",
    description: "เรียนออนไลน์ ทำแบบทดสอบ และรับวุฒิบัตรที่ตรวจสอบได้",
    lang: "th",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#faf9f7",
    theme_color: "#2563eb",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "คอร์สของฉัน", url: "/my-courses", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "วุฒิบัตรของฉัน", url: "/certificates", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "ตรวจสอบวุฒิบัตร", url: "/verify", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
