"use client";

import { maskEmail } from "@/lib/mask-email";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Link2, LockOpen, Mail, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Alert, Button, Checkbox, Dialog, Field, Input, useToast } from "@/components/ui";
import { useConfirm } from "@/components/common/ConfirmProvider";

type Result = { title: string; secret: string; lines: string[] } | null;

/**
 * Admin password tools for one member (see server/admin/password.service.ts):
 * email a reset link, hand over a single-use link, set a temporary password (must be changed at next login),
 * or clear the login throttle. The protected system owner never reaches this component.
 */
export function PasswordAdminPanel({ userId, email, emailVerified, mustChange }: { userId: string; email: string; emailVerified: boolean; mustChange: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [tempOpen, setTempOpen] = useState(false);
  const [tempError, setTempError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [copied, setCopied] = useState(false);
  const hasEmail = !email.endsWith(".invalid");

  async function call<T>(key: string, path: string, body: unknown = {}) {
    setBusy(key);
    const r = await api<T>(`/api/admin/users/${userId}/${path}`, { body });
    setBusy(null);
    if (!r.ok) toast({ title: "ทำรายการไม่สำเร็จ", description: r.message, variant: "destructive" });
    return r;
  }

  async function sendEmail(logout: boolean) {
    const msg = logout
      ? `ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${maskEmail(email)} และออกจากระบบทุกอุปกรณ์ของผู้ใช้ทันที?`
      : `ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${maskEmail(email)}? (ผู้ใช้ยังใช้งานต่อได้จนกว่าจะตั้งรหัสใหม่)`;
    if (!(await confirm({ title: msg, destructive: logout }))) return;
    const r = await call<{ sentTo: string }>(logout ? "email-logout" : "email", "reset-password", { logout });
    if (r.ok) {
      toast({ title: "บันทึกคำขอส่งอีเมลแล้ว", description: `ลิงก์ใช้ได้ 1 ชั่วโมง · ${r.data.sentTo}`, variant: "success" });
      router.refresh();
    }
  }

  async function createLink() {
    const r = await call<{ link: string; expiresAt: string }>("link", "reset-link");
    if (r.ok) {
      setResult({
        title: "ลิงก์ตั้งรหัสผ่าน (ใช้ได้ครั้งเดียว)",
        secret: r.data.link,
        lines: [`ใช้ได้ถึง ${new Date(r.data.expiresAt).toLocaleString("th-TH")}`, "ส่งให้ผู้ใช้ทางช่องทางที่ยืนยันตัวตนแล้วเท่านั้น ใครมีลิงก์นี้ก็ตั้งรหัสผ่านของบัญชีนี้ได้"],
      });
      router.refresh();
    }
  }

  async function setTemporary(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setTempError(null);
    setBusy("temp");
    const r = await api<{ password: string; loginId: string }>(`/api/admin/users/${userId}/temporary-password`, {
      body: { password: String(f.get("password") ?? ""), verifyEmail: f.get("verifyEmail") === "on" },
    });
    setBusy(null);
    if (!r.ok) return setTempError(r.message);
    setTempOpen(false);
    setResult({
      title: "รหัสผ่านชั่วคราว",
      secret: r.data.password,
      lines: [`ชื่อเข้าสู่ระบบ: ${r.data.loginId}`, "ผู้ใช้ต้องตั้งรหัสผ่านใหม่ของตนเองทันทีที่เข้าสู่ระบบด้วยรหัสนี้ รหัสนี้จะไม่แสดงอีก"],
    });
    router.refresh();
  }

  async function unlock() {
    const r = await call("unlock", "unlock-login");
    if (r.ok) toast({ title: "ปลดล็อกการเข้าสู่ระบบแล้ว", description: "ผู้ใช้ลองเข้าสู่ระบบได้ทันที", variant: "success" });
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-4">
      {mustChange && <Alert variant="warning" title="ผู้ใช้กำลังใช้รหัสผ่านชั่วคราว">จะต้องตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งถัดไป</Alert>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Action icon={<Mail className="h-4 w-4" />} title="ส่งลิงก์ทางอีเมล" text="ผู้ใช้ตั้งรหัสเองผ่านลิงก์ในอีเมล (1 ชั่วโมง)" disabled={!hasEmail}>
          <Button size="sm" variant="outline" loading={busy === "email"} disabled={!hasEmail || !!busy} onClick={() => void sendEmail(false)}>ส่งลิงก์</Button>
          <Button size="sm" variant="outline" loading={busy === "email-logout"} disabled={!hasEmail || !!busy} onClick={() => void sendEmail(true)}>ส่งและออกจากระบบทุกอุปกรณ์</Button>
        </Action>
        <Action icon={<Link2 className="h-4 w-4" />} title="สร้างลิงก์ให้ส่งเอง" text="เมื่ออีเมลไปไม่ถึง: คัดลอกลิงก์ส่งทางช่องทางอื่น (24 ชั่วโมง ใช้ครั้งเดียว)">
          <Button size="sm" variant="outline" loading={busy === "link"} disabled={!!busy} onClick={() => void createLink()}>สร้างลิงก์</Button>
        </Action>
        <Action icon={<KeyRound className="h-4 w-4" />} title="ตั้งรหัสผ่านชั่วคราว" text="แจ้งรหัสให้ผู้ใช้โดยตรง ผู้ใช้ต้องเปลี่ยนเป็นรหัสของตนเองเมื่อเข้าสู่ระบบ">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { setTempError(null); setTempOpen(true); }}>ตั้งรหัสชั่วคราว</Button>
        </Action>
        <Action icon={<LockOpen className="h-4 w-4" />} title="ปลดล็อกการเข้าสู่ระบบ" text="เมื่อผู้ใช้ลองรหัสผิดหลายครั้งจนถูกพักการเข้าสู่ระบบชั่วคราว">
          <Button size="sm" variant="outline" loading={busy === "unlock"} disabled={!!busy} onClick={() => void unlock()}>ปลดล็อก</Button>
        </Action>
      </div>

      <Dialog open={tempOpen} onOpenChange={setTempOpen} title="ตั้งรหัสผ่านชั่วคราว" description="ผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์ และต้องตั้งรหัสผ่านใหม่ก่อนใช้งาน">
        <form onSubmit={setTemporary} className="grid gap-4">
          {tempError && <Alert variant="destructive" title={tempError} />}
          <Field label="รหัสผ่านชั่วคราว" hint="เว้นว่างเพื่อให้ระบบสุ่มรหัสที่อ่านออกเสียงง่าย (อย่างน้อย 12 ตัวอักษร)">
            <Input name="password" type="text" autoComplete="off" spellCheck={false} maxLength={256} className="font-mono" />
          </Field>
          {!emailVerified && <Checkbox name="verifyEmail" label="ยืนยันอีเมลให้ด้วย (บัญชีนี้ยังไม่ได้ยืนยันอีเมล จึงยังเข้าสู่ระบบไม่ได้)" />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setTempOpen(false)}>ยกเลิก</Button>
            <Button type="submit" loading={busy === "temp"}><RefreshCw className="h-4 w-4" /> ตั้งรหัสชั่วคราว</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!result} onOpenChange={(v) => !v && setResult(null)} title={result?.title ?? ""}>
        {result && (
          <div className="grid gap-3">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-sm">{result.secret}</code>
              <Button size="sm" variant="outline" onClick={() => void copy()} aria-label="คัดลอก">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {result.lines.map((l) => <p key={l} className="text-sm text-muted-foreground">{l}</p>)}
            <Button className="justify-self-end" onClick={() => setResult(null)}>ปิด</Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Action({ icon, title, text, disabled, children }: { icon: React.ReactNode; title: string; text: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid content-between gap-3 rounded-lg border p-4 ${disabled ? "opacity-60" : ""}`}>
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">{icon} {title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{text}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
