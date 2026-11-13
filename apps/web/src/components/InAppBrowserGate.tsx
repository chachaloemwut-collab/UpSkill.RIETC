"use client";
// Spec 3.1 #1: LINE / Facebook / IG / TikTok WebViews block Google OAuth (403 disallowed_useragent)
// and PDF downloads often fail -> tell the user to open the page in Safari/Chrome
import { useState, useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";
import { detectInAppBrowser, externalBrowserUrl } from "@upskill/core/user-agent";
import { Button, buttonClass } from "@/components/ui";

const noopSubscribe = () => () => {};

export function InAppBrowserGate() {
  // The user agent never changes during a page's life: read it once on the client, "" on the server
  const ua = useSyncExternalStore(noopSubscribe, () => navigator.userAgent, () => "");
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  const detected = ua ? detectInAppBrowser(ua) : null;
  const info = detected?.inApp && !dismissed ? detected : null;
  if (!info) return null;
  const external = externalBrowserUrl(window.location.href, info);

  return (
    <div role="dialog" aria-modal="true" aria-label="กรุณาเปิดในเบราว์เซอร์หลัก" className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm animate-slide-up rounded-xl border bg-background p-5 shadow-xl">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ExternalLink className="h-5 w-5" />
        </span>
        <h2 className="mt-3 text-lg font-semibold">กรุณาเปิดในเบราว์เซอร์หลัก</h2>
        <p className="mt-1 text-sm text-muted-foreground">แอปที่คุณใช้อยู่ไม่รองรับการเข้าสู่ระบบด้วย Google และการดาวน์โหลดใบรับรอง</p>
        <div className="mt-5 grid gap-2">
          {external ? (
            <a href={external} className={buttonClass("default", "lg", "w-full")}>
              {info.os === "ios" ? "เปิดใน Safari" : "เปิดใน Chrome"}
            </a>
          ) : (
            <p className="rounded-md bg-muted p-3 text-sm">
              แตะเมนู <b>⋯</b> มุมขวาบน แล้วเลือก <b>เปิดในเบราว์เซอร์</b> หรือคัดลอกลิงก์ไปวางใน Safari
            </p>
          )}
          <Button
            variant="outline"
            size="lg"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
              } catch {
                /* some WebViews block the clipboard */
              }
            }}
          >
            {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
          </Button>
          <Button variant="ghost" onClick={() => setDismissed(true)} className="text-muted-foreground">
            ดำเนินการต่อในแอปนี้
          </Button>
        </div>
      </div>
    </div>
  );
}
