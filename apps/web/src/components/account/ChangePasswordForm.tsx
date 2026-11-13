"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Alert, Button, Field, Input } from "@/components/ui";

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("new") !== f.get("confirm")) return setMsg({ tone: "error", text: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" });
    setBusy(true);
    const r = await api("/api/user/password", {
      body: { ...(hasPassword ? { current_password: f.get("current") } : {}), new_password: f.get("new") },
    });
    setBusy(false);
    if (r.ok) {
      form.reset();
      setMsg({ tone: "success", text: "เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นถูกออกจากระบบ" });
    } else setMsg({ tone: "error", text: r.message });
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {hasPassword && (
        <Field label="รหัสผ่านปัจจุบัน">
          <Input name="current" type="password" autoComplete="current-password" required />
        </Field>
      )}
      <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 12 ตัวอักษร">
        <Input name="new" type="password" autoComplete="new-password" minLength={12} required />
      </Field>
      <Field label="ยืนยันรหัสผ่านใหม่">
        <Input name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </Field>
      <Button type="submit" disabled={busy}>
        {hasPassword ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่าน"}
      </Button>
    </form>
  );
}
