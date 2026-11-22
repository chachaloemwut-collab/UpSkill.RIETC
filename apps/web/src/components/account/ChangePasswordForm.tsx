"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { MailCheck } from "lucide-react";
import { Alert, Button, Field, PasswordInput, useToast } from "@/components/ui";
import { useConfirm } from "@/components/common/ConfirmProvider";

/**
 * Change the password with the current one, or — for someone who no longer remembers it — mail a reset link to
 * the account's own address (canEmailReset: false for the protected owner and accounts without a real address).
 */
export function ChangePasswordForm({ hasPassword, canEmailReset = false }: { hasPassword: boolean; canEmailReset?: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("new") !== f.get("confirm")) return setMismatch(true);
    setMismatch(false);
    setError(null);
    setBusy(true);
    const r = await api("/api/user/password", {
      body: { ...(hasPassword ? { current_password: f.get("current") } : {}), new_password: f.get("new") },
    });
    setBusy(false);
    if (r.ok) {
      form.reset();
      toast({ title: hasPassword ? "เปลี่ยนรหัสผ่านแล้ว" : "ตั้งรหัสผ่านแล้ว", description: "อุปกรณ์อื่นถูกออกจากระบบ", variant: "success" });
    } else setError(r.code === "INVALID_CREDENTIALS" ? "รหัสผ่านปัจจุบันไม่ถูกต้อง" : r.message);
  }

  async function emailMeALink() {
    const ok = await confirm({
      title: "ส่งลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล?",
      description: "ระบบจะส่งลิงก์ไปที่อีเมลหลักของบัญชีนี้ ลิงก์ใช้ได้ 1 ชั่วโมง รหัสผ่านเดิมยังใช้ได้จนกว่าคุณจะตั้งรหัสใหม่",
      confirmLabel: "ส่งลิงก์",
    });
    if (!ok) return;
    setSending(true);
    const r = await api<{ email: string }>("/api/user/password/reset-link", { body: {} });
    setSending(false);
    if (r.ok) toast({ title: "ส่งลิงก์แล้ว", description: `ตรวจสอบอีเมล ${r.data.email} (รวมถึงโฟลเดอร์จดหมายขยะ)`, variant: "success" });
    else toast({ title: "ส่งลิงก์ไม่สำเร็จ", description: r.message, variant: "destructive" });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 [&>*]:min-w-0">
      {error && <Alert variant="destructive" title={error} />}
      {hasPassword && (
        <Field label="รหัสผ่านปัจจุบัน">
          <PasswordInput name="current" autoComplete="current-password" required />
        </Field>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 12 ตัวอักษร">
          <PasswordInput name="new" autoComplete="new-password" minLength={12} required />
        </Field>
        <Field label="ยืนยันรหัสผ่านใหม่" error={mismatch ? "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" : undefined}>
          <PasswordInput name="confirm" autoComplete="new-password" minLength={12} required />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={busy}>
          {hasPassword ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่าน"}
        </Button>
        {canEmailReset && (
          <Button type="button" variant="ghost" loading={sending} onClick={() => void emailMeALink()}>
            <MailCheck className="h-4 w-4" /> {hasPassword ? "ลืมรหัสผ่านปัจจุบัน? ส่งลิงก์ทางอีเมล" : "ส่งลิงก์ตั้งรหัสผ่านทางอีเมล"}
          </Button>
        )}
      </div>
    </form>
  );
}
