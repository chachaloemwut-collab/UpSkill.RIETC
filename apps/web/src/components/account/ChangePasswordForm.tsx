"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Alert, Button, Field, PasswordInput, useToast } from "@/components/ui";

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const toast = useToast();
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
    } else setError(r.message);
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
      <Button type="submit" loading={busy} className="justify-self-start">
        {hasPassword ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่าน"}
      </Button>
    </form>
  );
}
