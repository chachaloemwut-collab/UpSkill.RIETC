"use client";
// Spec 3.1 #1: LINE / Facebook / IG / TikTok WebViews block Google OAuth (403 disallowed_useragent)
// and PDF downloads often fail -> tell the user to open the page in Safari/Chrome
import { useState, useSyncExternalStore } from "react";
import { detectInAppBrowser, externalBrowserUrl } from "@upskill/core/user-agent";

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
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">กรุณาเปิดในเบราว์เซอร์หลัก</h2>
        <p className="mt-2 text-sm text-neutral-600">
          แอปที่คุณใช้อยู่ไม่รองรับการเข้าสู่ระบบด้วย Google และการดาวน์โหลดใบรับรอง
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {external ? (
            <a href={external} className="rounded-lg bg-blue-600 px-4 py-2.5 text-center font-medium text-white">
              {info.os === "ios" ? "เปิดใน Safari" : "เปิดใน Chrome"}
            </a>
          ) : (
            <p className="rounded-lg bg-neutral-100 p-3 text-sm">
              แตะเมนู <b>⋯</b> มุมขวาบน แล้วเลือก <b>เปิดในเบราว์เซอร์</b> หรือคัดลอกลิงก์ไปวางใน Safari
            </p>
          )}
          <button
            type="button"
            className="rounded-lg border px-4 py-2.5 font-medium"
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
          </button>
          <button type="button" className="py-2 text-sm text-neutral-500" onClick={() => setDismissed(true)}>
            ดำเนินการต่อในแอปนี้
          </button>
        </div>
      </div>
    </div>
  );
}
