"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Ban, BadgeCheck, MoreHorizontal, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { AlertDialog, Button, DropdownMenu, Field, Input, Select, Textarea, useToast } from "@/components/ui";

export function CourseAdminControls({ courseId, title, visibility, verified }: { courseId: string; title: string; visibility: string; verified: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const patch = async (body: Record<string, unknown>, done: string) => {
    const r = await api(`/api/admin/courses/${courseId}`, { method: "PATCH", body });
    if (r.ok) {
      toast({ title: done, variant: "success" });
      router.refresh();
    } else toast({ title: "ทำรายการไม่สำเร็จ", description: r.message, variant: "destructive" });
  };
  return (
    <>
      <DropdownMenu
        align="end"
        trigger={
          <Button variant="ghost" size="icon" aria-label={`จัดการ ${title}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
        items={[
          {
            label: verified ? "ยกเลิก Verified" : "รับรองเป็น Verified",
            icon: <BadgeCheck className="h-4 w-4" />,
            onSelect: () => void patch({ is_verified_course: !verified }, verified ? "ยกเลิก Verified แล้ว" : "รับรองหลักสูตรแล้ว"),
          },
          { label: "", separator: true },
          visibility === "suspended"
            ? { label: "ยกเลิกการระงับ (กลับเป็นฉบับร่าง)", icon: <RotateCcw className="h-4 w-4" />, onSelect: () => void patch({ visibility: "draft" }, "ยกเลิกการระงับแล้ว") }
            : { label: "ระงับหลักสูตร", icon: <Ban className="h-4 w-4" />, destructive: true, onSelect: () => setConfirmSuspend(true) },
        ]}
      />
      <AlertDialog
        open={confirmSuspend}
        onOpenChange={setConfirmSuspend}
        title="ระงับหลักสูตรนี้?"
        description={`“${title}” จะถูกซ่อนจากผู้เรียนทุกคนจนกว่าจะยกเลิกการระงับ`}
        confirmLabel="ระงับ"
        cancelLabel="ยกเลิก"
        destructive
        onConfirm={() => void patch({ visibility: "suspended" }, "ระงับหลักสูตรแล้ว")}
      />
    </>
  );
}

export function RevokeCertificateForm() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ code: string; reason: string; form: HTMLFormElement } | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending({ code: String(f.get("code")).trim(), reason: String(f.get("reason")), form: e.currentTarget });
  }
  async function revoke() {
    if (!pending) return;
    setBusy(true);
    const r = await api(`/api/admin/certificates/${encodeURIComponent(pending.code)}/revoke`, { body: { reason: pending.reason } });
    setBusy(false);
    if (r.ok) {
      pending.form.reset();
      toast({ title: "เพิกถอนใบรับรองแล้ว", description: pending.code, variant: "success" });
    } else toast({ title: "เพิกถอนไม่สำเร็จ", description: r.message, variant: "destructive" });
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="รหัสใบรับรอง">
        <Input name="code" required placeholder="CERT-2026-XXXX-XXXX-XXXX" className="font-mono" />
      </Field>
      <Field label="เหตุผล" hint="แสดงบนหน้าตรวจสอบสาธารณะ">
        <Textarea name="reason" required minLength={5} maxLength={1000} rows={3} />
      </Field>
      <Button type="submit" variant="destructive" loading={busy} className="justify-self-start">
        <Ban className="h-4 w-4" /> เพิกถอน
      </Button>
      <AlertDialog
        open={!!pending}
        onOpenChange={(v) => !v && setPending(null)}
        title="เพิกถอนใบรับรอง?"
        description={`${pending?.code ?? ""} — การเพิกถอนย้อนกลับไม่ได้`}
        confirmLabel="เพิกถอน"
        cancelLabel="ยกเลิก"
        destructive
        onConfirm={() => void revoke()}
      />
    </form>
  );
}

export function UserAdminForm() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await api("/api/admin/users", {
      method: "PATCH",
      body: { email: f.get("email"), ...(f.get("role") ? { role: f.get("role") } : {}), ...(f.get("status") ? { status: f.get("status") } : {}) },
    });
    setBusy(false);
    if (r.ok) toast({ title: "อัปเดตผู้ใช้แล้ว", description: "ผู้ใช้ถูกออกจากระบบทุกอุปกรณ์", variant: "success" });
    else toast({ title: "อัปเดตไม่สำเร็จ", description: r.message, variant: "destructive" });
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="อีเมลผู้ใช้">
        <Input name="email" type="email" required placeholder="user@example.com" />
      </Field>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label="บทบาท">
          <Select name="role" defaultValue="">
            <option value="">ไม่เปลี่ยน</option>
            <option value="member">ผู้เรียน (member)</option>
            <option value="instructor">ผู้สอน (instructor)</option>
            <option value="admin">ผู้ดูแลระบบ (admin)</option>
          </Select>
        </Field>
        <Field label="สถานะ">
          <Select name="status" defaultValue="">
            <option value="">ไม่เปลี่ยน</option>
            <option value="active">ใช้งาน (active)</option>
            <option value="suspended">ระงับชั่วคราว (suspended)</option>
            <option value="banned">แบน (banned)</option>
          </Select>
        </Field>
      </div>
      <Button type="submit" loading={busy} className="justify-self-start">
        บันทึก
      </Button>
    </form>
  );
}
