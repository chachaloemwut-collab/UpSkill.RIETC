"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Award } from "lucide-react";
import { Button } from "@/components/ui";

/** Issue (or view) the program-level certificate. The POST is idempotent per user+program. */
export function ProgramCertificateButton({ programId }: { programId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function issue() {
    setBusy(true);
    try {
      const r = await fetch(`/api/programs/${programId}/certificate/issue`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { code?: string; error?: string };
      if (r.ok && j.code) {
        router.push(`/verify/${j.code}`);
        return;
      }
      window.alert(
        j.error === "PROGRAM_NOT_COMPLETED"
          ? "ยังเรียนไม่ครบทุกวิชาบังคับของหลักสูตร"
          : j.error === "NOT_APPROVED"
            ? "ต้องได้รับการอนุมัติเข้าอบรมก่อน"
            : "ยังไม่สามารถออกวุฒิบัตรได้",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" loading={busy} onClick={issue}>
      <Award className="h-4 w-4" /> รับวุฒิบัตร
    </Button>
  );
}
