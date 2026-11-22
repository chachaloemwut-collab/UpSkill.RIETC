"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import { useConfirm } from "@/components/common/ConfirmProvider";
import { api } from "@/lib/api";

export function DisconnectDevice({ path }: { path: string }) {
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function disconnect() {
    if (!await confirm({ title: "ออกจากระบบเฉพาะอุปกรณ์นี้?", description: "เมื่อใช้งานครั้งถัดไป อุปกรณ์ที่เลือกต้องเข้าสู่ระบบอีกครั้ง", confirmLabel: "ยืนยัน", destructive: true })) return;
    setBusy(true);
    try {
      const response = await api(path, { method: "DELETE" });
      toast({ title: response.ok ? "ออกจากระบบบนอุปกรณ์ที่เลือกแล้ว" : response.message, variant: response.ok ? "success" : "destructive" });
      router.refresh();
    } finally { setBusy(false); }
  }
  return <Button variant="outline" size="sm" loading={busy} onClick={() => void disconnect()}>ออกจากระบบอุปกรณ์นี้</Button>;
}
