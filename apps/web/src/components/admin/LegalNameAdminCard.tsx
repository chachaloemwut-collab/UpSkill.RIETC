"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen, Pencil, Save, X } from "lucide-react";
import { Badge, Button, Card, Field, Input, useToast } from "@/components/ui";
import { formatDateTimeTh } from "@/lib/format";
import { api } from "@/lib/api";

export interface LegalNameAdminCardProps {
  userId: string;
  nameTh: string | null;
  nameEn: string | null;
  lockedAt: string | null;
}

export function LegalNameAdminCard({
  userId,
  nameTh,
  nameEn,
  lockedAt,
}: LegalNameAdminCardProps) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [th, setTh] = useState(nameTh ?? "");
  const [en, setEn] = useState(nameEn ?? "");
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    if (!window.confirm("ยืนยันปลดล็อกชื่อ-นามสกุลทางการ? ผู้เรียนจะสามารถแก้ไขชื่อได้ด้วยตนเองในหน้าโปรไฟล์")) return;
    setBusy(true);
    try {
      const res = await api(`/api/admin/users/${userId}/unlock-legal-name`, { method: "POST" });
      if (!res.ok) {
        toast({ variant: "destructive", title: "ข้อผิดพลาด", description: res.message });
        return;
      }
      toast({ title: "ปลดล็อกสำเร็จ", description: "ปลดล็อกชื่อ-นามสกุลแล้ว ผู้เรียนสามารถแก้ไขได้ในหน้าโปรไฟล์" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const saveNames = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api(`/api/admin/users/${userId}/legal-name`, {
        method: "PATCH",
        body: { th: th.trim() || null, en: en.trim() || null },
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "ข้อผิดพลาด", description: res.message });
        return;
      }
      toast({ title: "บันทึกสำเร็จ", description: "อัปเดตชื่อ-นามสกุลทางการแล้ว" });
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 font-semibold">
          {lockedAt ? <Lock className="h-4 w-4 text-amber-500" /> : <LockOpen className="h-4 w-4 text-emerald-500" />}
          ชื่อ-นามสกุลทางการสำหรับใบรับรอง
        </h2>
        <div className="flex items-center gap-2">
          {lockedAt ? (
            <Badge variant="warning" className="text-xs">ล็อกแล้ว</Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">ยังไม่ล็อก</Badge>
          )}
        </div>
      </div>

      {editing ? (
        <form onSubmit={saveNames} className="space-y-3 text-sm">
          <Field label="ชื่อ-นามสกุลภาษาไทย (รวมคำนำหน้า)">
            <Input value={th} onChange={(e) => setTh(e.target.value)} placeholder="เช่น นายสมชาย ใจดี" />
          </Field>
          <Field label="ชื่อ-นามสกุลภาษาอังกฤษ">
            <Input value={en} onChange={(e) => setEn(e.target.value)} placeholder="เช่น Mr. Somchai Jaidee" />
          </Field>
          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" size="sm" loading={busy}>
              <Save className="h-4 w-4 mr-1" /> บันทึก
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
              <X className="h-4 w-4 mr-1" /> ยกเลิก
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-muted-foreground block">ชื่อภาษาไทย:</span>
              <span className="font-medium text-foreground">{nameTh || "—"}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">ชื่อภาษาอังกฤษ:</span>
              <span className="font-medium text-foreground">{nameEn || "—"}</span>
            </div>
          </div>

          {lockedAt && (
            <p className="text-xs text-muted-foreground">
              ล็อกข้อมูลเมื่อ: {formatDateTimeTh(lockedAt)}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> แก้ไขชื่อ
            </Button>

            {lockedAt && (
              <Button variant="outline" size="sm" loading={busy} onClick={unlock} className="text-amber-600 dark:text-amber-400">
                <LockOpen className="h-3.5 w-3.5 mr-1" /> ปลดล็อกชื่อให้ผู้เรียน
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
