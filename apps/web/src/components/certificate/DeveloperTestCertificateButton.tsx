"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Button, Card, useToast } from "@/components/ui";
import { api } from "@/lib/api";

export function DeveloperTestCertificateButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const handleIssue = async () => {
    setBusy(true);
    const res = await api<{ ok: boolean; code: string; created: boolean }>("/api/developer/test-certificate", {
      method: "POST",
    });
    setBusy(false);
    if (res.ok) {
      toast({
        title: "ออกใบประกาศทดสอบสำเร็จ",
        description: `รหัส: ${res.data?.code ?? ""}`,
        variant: "success",
      });
      router.refresh();
    } else {
      toast({
        title: "ออกใบประกาศทดสอบไม่สำเร็จ",
        description: res.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-dashed border-amber-500/70 bg-amber-500/10 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
          <FlaskConical className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold text-foreground">บัญชีผู้พัฒนา (Developer Test Account)</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            คุณสามารถกดออกใบประกาศนียบัตรสำหรับทดสอบระบบได้ โดยเอกสารจะระบุสถานะ TEST / DEVELOPMENT ชัดเจน
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" loading={busy} onClick={handleIssue} className="border-amber-500/50 hover:bg-amber-500/20">
        <FlaskConical className="h-4 w-4 text-amber-600" /> ออกใบประกาศทดสอบระบบ
      </Button>
    </Card>
  );
}
