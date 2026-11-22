"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useToast } from "@/components/ui/toast";
import { BrandSignal } from "./BrandActivity";

function observeConnection(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function ServiceStatus() {
  const online = useSyncExternalStore(observeConnection, () => navigator.onLine, () => true);
  const toast = useToast();
  useEffect(() => {
    let lastNotice = 0;
    const notify = () => {
      if (Date.now() - lastNotice < 5000) return;
      lastNotice = Date.now();
      toast({ brandState: "maintenance", title: "บริการไม่พร้อมใช้งานชั่วคราว", description: "กรุณาลองอีกครั้งภายหลัง" });
    };
    window.addEventListener("rietc:service-unavailable", notify);
    return () => window.removeEventListener("rietc:service-unavailable", notify);
  }, [toast]);
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-muted p-2 text-sm print:hidden">
      <BrandSignal state="offline" broadcast /> ไม่มีการเชื่อมต่ออินเทอร์เน็ต
    </div>
  );
}
