"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button, buttonClass } from "@/components/ui";
import { useConfirm } from "@/components/common/ConfirmProvider";

/** PDPA data-subject rights: export own data and request erasure. */
export function DataRights() {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function doDelete() {
    if (!(await confirm({ title: "ลบบัญชีของคุณถาวร?", description: "ข้อมูลที่ระบุตัวตนจะถูกลบ แต่วุฒิบัตรและบันทึกการตรวจสอบจะยังคงอยู่ การลบย้อนกลับไม่ได้", confirmLabel: "ลบบัญชี", destructive: true }))) return;
    setBusy(true);
    try {
      const r = await fetch("/api/user/me", { method: "DELETE" });
      if (r.ok) {
        router.push("/login");
        return;
      }
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      window.alert(j.error === "ALREADY_DELETED" ? "บัญชีนี้ถูกลบไปแล้ว" : "ไม่สามารถลบบัญชีได้ กรุณาลองใหม่ภายหลัง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a href="/api/user/data-export" className={buttonClass("outline", "sm")}>
        <Download className="h-4 w-4" /> ดาวน์โหลดข้อมูลของฉัน
      </a>
      <Button variant="destructive" size="sm" loading={busy} onClick={doDelete}>
        <Trash2 className="h-4 w-4" /> ลบบัญชี
      </Button>
    </div>
  );
}
