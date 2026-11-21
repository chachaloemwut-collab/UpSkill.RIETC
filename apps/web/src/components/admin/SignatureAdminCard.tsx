"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PenLine, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { Alert, Button, Card, Switch, useToast } from "@/components/ui";
import { useConfirm } from "@/components/common/ConfirmProvider";

/**
 * Admin-only: the course's signature image and the switch that prints the signer on its certificates.
 * The signer (signature + name + title) is printed only when the switch is on AND a signature exists;
 * the decision is frozen into each certificate when it is issued.
 */
export function SignatureAdminCard({ courseId, signatureKey, showSigner, signerName }: { courseId: string; signatureKey: string | null; showSigner: boolean; signerName: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/admin/courses/${courseId}`;

  async function upload(file: File) {
    if (file.size > 1024 * 1024) return toast({ title: "ไฟล์ลายเซ็นต้องไม่เกิน 1 MB", variant: "destructive" });
    setBusy(true);
    const res = await fetch(`${base}/signature`, { method: "POST", body: file, headers: { "content-type": file.type || "application/octet-stream" } }).catch(() => null);
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!res?.ok) {
      const data = (await res?.json().catch(() => ({}))) as { error?: string; message?: string } | undefined;
      return toast({ title: "อัปโหลดไม่สำเร็จ", description: errorMessage(data?.error, data?.message), variant: "destructive" });
    }
    toast({ title: "อัปโหลดลายเซ็นแล้ว", description: showSigner ? undefined : "เปิดสวิตช์ด้านล่างเมื่อพร้อมให้พิมพ์บนเอกสาร", variant: "success" });
    router.refresh();
  }

  async function remove() {
    if (!(await confirm({ title: "ลบลายเซ็นของหลักสูตรนี้? การแสดงผู้ลงนามจะถูกปิดด้วย (เอกสารที่ออกไปแล้วไม่เปลี่ยน)", destructive: true }))) return;
    setBusy(true);
    const r = await api(`${base}/signature`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return toast({ title: "ลบไม่สำเร็จ", description: r.message, variant: "destructive" });
    router.refresh();
  }

  async function toggle(show: boolean) {
    setBusy(true);
    const r = await api(`${base}/signer`, { method: "PATCH", body: { show } });
    setBusy(false);
    if (!r.ok) return toast({ title: "เปลี่ยนไม่สำเร็จ", description: r.message, variant: "destructive" });
    toast({ title: show ? "เปิดการแสดงผู้ลงนามแล้ว" : "ปิดการแสดงผู้ลงนามแล้ว", description: "มีผลกับเอกสารที่ออกหลังจากนี้", variant: "success" });
    router.refresh();
  }

  const active = showSigner && !!signatureKey;
  return (
    <Card className="grid gap-4 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b pb-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-foreground"><PenLine className="h-4 w-4" /> ลายเซ็นผู้ลงนาม (เฉพาะผู้ดูแลระบบ)</h3>
          <p className="text-xs text-muted-foreground">ถ้าไม่มีลายเซ็น เอกสารจะไม่พิมพ์ชื่อผู้ลงนาม และระบุว่ารับรองด้วยลายมือชื่อดิจิทัลของระบบแทน</p>
        </div>
        <div className="shrink-0 whitespace-nowrap">
          <Switch checked={active} disabled={busy || !signatureKey} onCheckedChange={(v) => void toggle(v)} label={active ? "แสดงผู้ลงนาม" : "ไม่แสดงผู้ลงนาม"} />
        </div>
      </div>

      {signatureKey ? (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-60 items-center justify-center rounded-lg border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, admin-only image */}
            <img src={`${base}/signature?v=${signatureKey.slice(0, 12)}`} alt="ลายเซ็นปัจจุบัน" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="grid gap-1 text-sm">
            <p>ผู้ลงนาม: <span className="font-medium">{signerName?.trim() || "— ยังไม่ได้กรอกชื่อผู้ลงนามในการตั้งค่าด้านบน"}</span></p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" loading={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" /> เปลี่ยนไฟล์</Button>
              <Button size="sm" variant="outline" loading={busy} onClick={() => void remove()}><Trash2 className="h-4 w-4" /> ลบลายเซ็น</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <Alert variant="default" title="ยังไม่มีลายเซ็น">ตอนนี้เอกสารของหลักสูตรนี้จะไม่พิมพ์ชื่อผู้ลงนาม</Alert>
          <Button size="sm" variant="outline" className="justify-self-start" loading={busy} onClick={() => input.current?.click()}>
            <Upload className="h-4 w-4" /> อัปโหลดลายเซ็น
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">ไฟล์ PNG พื้นหลังโปร่งใส (แนะนำ) หรือ JPG ไม่เกิน 1 MB · ลายเซ็นใหม่หรือการเปิด/ปิด มีผลกับเอกสารที่ออกหลังจากนี้เท่านั้น</p>
      <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
    </Card>
  );
}
