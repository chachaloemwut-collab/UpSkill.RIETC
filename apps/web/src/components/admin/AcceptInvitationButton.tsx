"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui";

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { error?: string; role?: string };
      if (!res.ok) {
        setError(mapError(data.error));
        return;
      }
      router.refresh();
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <Button size="lg" loading={busy} onClick={() => void accept()}>
        <CheckCircle2 className="h-5 w-5" /> ยอมรับคำเชิญเป็นผู้สอน
      </Button>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}

function mapError(code?: string): string {
  switch (code) {
    case "ALREADY_ACCEPTED": return "คำเชิญนี้ถูกยอมรับไปแล้ว";
    case "INVITATION_REVOKED": return "คำเชิญนี้ถูกยกเลิกโดยผู้ดูแลระบบแล้ว";
    case "INVITATION_EXPIRED": return "คำเชิญนี้หมดอายุแล้ว กรุณาขอคำเชิญใหม่";
    case "EMAIL_MISMATCH": return "อีเมลของบัญชีนี้ไม่ตรงกับอีเมลที่ได้รับเชิญ";
    case "ACCOUNT_DISABLED": return "บัญชีนี้ถูกระงับ ไม่สามารถยอมรับคำเชิญได้";
    default: return "ไม่สามารถยอมรับคำเชิญได้ กรุณาลองใหม่";
  }
}
