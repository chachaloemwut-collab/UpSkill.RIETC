"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Award, CheckCircle, RotateCcw } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { api } from "@/lib/api";

export interface EnrollmentAdminActionsProps {
  userId: string;
  enrollmentId: string;
  courseId: string;
  currentStatus: string;
  hasCertificate: boolean;
}

export function EnrollmentAdminActions({
  userId,
  enrollmentId,
  courseId,
  currentStatus,
  hasCertificate,
}: EnrollmentAdminActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const setStatus = async (status: "completed" | "in_progress") => {
    const confirmMsg =
      status === "completed"
        ? "ยืนยันอนุมัติจบหลักสูตรสำหรับผู้เรียนคนนี้เป็นกรณีพิเศษ?"
        : "ยืนยันรีเซ็ตสถานะกลับเป็นกำลังเรียน?";
    if (!window.confirm(confirmMsg)) return;

    setBusy(true);
    try {
      const res = await api(`/api/admin/enrollments/${enrollmentId}/status`, {
        method: "POST",
        body: { status },
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "ข้อผิดพลาด", description: res.message });
        return;
      }
      toast({
        title: "สำเร็จ",
        description: status === "completed" ? "อนุมัติจบหลักสูตรแล้ว" : "รีเซ็ตสถานะเป็นกำลังเรียนแล้ว",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const manualIssue = async () => {
    // The score printed on the certificate must be stated, never defaulted
    const answer = window.prompt("ออกใบรับรองหลักสูตรนี้ให้ผู้เรียนทันที\nกรอกคะแนนที่จะพิมพ์บนใบรับรอง (0–100):");
    if (answer === null) return;
    const score = answer.trim() === "" ? NaN : Number(answer);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      toast({ variant: "destructive", title: "คะแนนไม่ถูกต้อง", description: "กรอกคะแนน 0–100" });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ code: string }>("/api/admin/certificates", {
        method: "POST",
        body: {
          userId,
          courseId,
          score,
          reason: "อนุมัติจบหลักสูตรและออกใบรับรองจากหน้าจัดการสมาชิก",
        },
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "ข้อผิดพลาด", description: res.message });
        return;
      }
      toast({ title: "ออกใบรับรองสำเร็จ", description: `รหัสใบรับรอง: ${res.data.code}` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
      {currentStatus !== "completed" && (
        <Button
          variant="outline"
          size="sm"
          loading={busy}
          onClick={() => setStatus("completed")}
          className="h-8 px-2 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          title="อนุมัติจบหลักสูตรเป็นกรณีพิเศษ"
        >
          <CheckCircle className="h-3 w-3 mr-1" /> จบหลักสูตร
        </Button>
      )}

      {currentStatus === "completed" && !hasCertificate && (
        <Button
          variant="default"
          size="sm"
          loading={busy}
          onClick={manualIssue}
          className="h-8 px-2 text-xs bg-primary text-primary-foreground"
          title="ออกใบรับรองทันที"
        >
          <Award className="h-3 w-3 mr-1" /> ออกใบรับรอง
        </Button>
      )}

      {currentStatus === "completed" && (
        <Button
          variant="ghost"
          size="sm"
          loading={busy}
          onClick={() => setStatus("in_progress")}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          title="รีเซ็ตสถานะกลับเป็นกำลังเรียน"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
