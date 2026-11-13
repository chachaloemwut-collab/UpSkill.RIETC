"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { Alert, Button, Field, Input } from "@/components/ui";

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return { busy, setBusy, error, setError, notice, setNotice };
}

function GoogleButton({ mode = "login", label }: { mode?: "login" | "reset"; label: string }) {
  // Full-page navigation (not fetch): the OAuth flow is a chain of top-level redirects
  return (
    <a
      href={`/api/auth/google?mode=${mode}`}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-stone-50"
    >
      <span aria-hidden>G</span> {label}
    </a>
  );
}

export function LoginForm({ googleEnabled, initialError }: { googleEnabled: boolean; initialError?: string | undefined }) {
  const router = useRouter();
  const s = useSubmit();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ? errorMessage(initialError) : null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    s.setBusy(true);
    setError(null);
    const r = await api("/api/auth/login", { body: { email: f.get("email"), password: f.get("password") } });
    s.setBusy(false);
    if (r.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setError(r.message);
    if (r.code === "EMAIL_NOT_VERIFIED") setUnverifiedEmail(String(f.get("email")));
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {unverifiedEmail && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={async () => {
              await api("/api/auth/resend-verification", { body: { email: unverifiedEmail } });
              setError(null);
              s.setNotice("ส่งลิงก์ยืนยันใหม่แล้ว กรุณาตรวจสอบอีเมล");
            }}
          >
            ส่งลิงก์ยืนยันอีเมลอีกครั้ง
          </Button>
        )}
        {s.notice && <Alert tone="success">{s.notice}</Alert>}
        <Field label="อีเมล">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="รหัสผ่าน">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" disabled={s.busy} className="w-full">
          {s.busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </Button>
      </form>
      {googleEnabled && <GoogleButton label="เข้าสู่ระบบด้วย Google" />}
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-green-700 underline">
          ลืมรหัสผ่าน
        </Link>
        <Link href="/register" className="text-green-700 underline">
          สมัครสมาชิก
        </Link>
      </div>
    </div>
  );
}

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const s = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return s.setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    s.setBusy(true);
    s.setError(null);
    const r = await api<{ message: string }>("/api/auth/register", { body: { email: f.get("email"), password: f.get("password") } });
    s.setBusy(false);
    if (r.ok) s.setNotice(r.data.message);
    else s.setError(r.message);
  }
  if (s.notice) return <Alert tone="success">{s.notice}</Alert>;
  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        {s.error && <Alert tone="error">{s.error}</Alert>}
        <Field label="อีเมล">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="รหัสผ่าน" hint="อย่างน้อย 12 ตัวอักษร แนะนำให้ใช้วลีที่จำง่ายแต่เดายาก">
          <Input name="password" type="password" autoComplete="new-password" minLength={12} required />
        </Field>
        <Field label="ยืนยันรหัสผ่าน">
          <Input name="confirm" type="password" autoComplete="new-password" minLength={12} required />
        </Field>
        <Button type="submit" disabled={s.busy} className="w-full">
          {s.busy ? "กำลังสมัคร…" : "สมัครสมาชิก"}
        </Button>
      </form>
      {googleEnabled && <GoogleButton label="สมัครด้วย Google" />}
    </div>
  );
}

export function ForgotPasswordForm({ googleEnabled }: { googleEnabled: boolean }) {
  const s = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    s.setBusy(true);
    const r = await api<{ message: string }>("/api/auth/forgot-password", { body: { email: f.get("email") } });
    s.setBusy(false);
    if (r.ok) s.setNotice(r.data.message);
    else s.setError(r.message);
  }
  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <h2 className="font-semibold">วิธีที่ 1: รับลิงก์ทางอีเมล</h2>
        {s.notice && <Alert tone="success">{s.notice}</Alert>}
        {s.error && <Alert tone="error">{s.error}</Alert>}
        <Field label="อีเมล">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Button type="submit" disabled={s.busy} className="w-full">
          ส่งลิงก์ตั้งรหัสผ่านใหม่
        </Button>
      </form>
      {googleEnabled && (
        <div className="space-y-2">
          <h2 className="font-semibold">วิธีที่ 2: ยืนยันตัวตนด้วย Google</h2>
          <p className="text-sm text-stone-600">สำหรับบัญชีที่ผูกกับ Google ไว้แล้ว</p>
          <GoogleButton mode="reset" label="ยืนยันตัวตนด้วย Google เพื่อตั้งรหัสผ่านใหม่" />
        </div>
      )}
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const s = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return s.setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    s.setBusy(true);
    const r = await api("/api/auth/reset-password", { body: { token, new_password: f.get("password") } });
    s.setBusy(false);
    if (r.ok) {
      s.setNotice("ตั้งรหัสผ่านใหม่แล้ว ทุกอุปกรณ์ถูกออกจากระบบ กรุณาเข้าสู่ระบบอีกครั้ง");
      setTimeout(() => {
        router.push("/login");
        router.refresh();
      }, 1500);
    } else s.setError(r.message);
  }
  if (s.notice) return <Alert tone="success">{s.notice}</Alert>;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {s.error && <Alert tone="error">{s.error}</Alert>}
      <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 12 ตัวอักษร">
        <Input name="password" type="password" autoComplete="new-password" minLength={12} required />
      </Field>
      <Field label="ยืนยันรหัสผ่านใหม่">
        <Input name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </Field>
      <Button type="submit" disabled={s.busy} className="w-full">
        ตั้งรหัสผ่านใหม่
      </Button>
    </form>
  );
}

export function VerifyEmailButton({ token }: { token: string }) {
  const s = useSubmit();
  if (s.notice)
    return (
      <div className="space-y-3">
        <Alert tone="success">{s.notice}</Alert>
        <Link href="/login" className="inline-block text-green-700 underline">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  return (
    <div className="space-y-3">
      {s.error && <Alert tone="error">{s.error}</Alert>}
      <Button
        className="w-full"
        disabled={s.busy}
        onClick={async () => {
          s.setBusy(true);
          const r = await api("/api/auth/verify-email", { body: { token } });
          s.setBusy(false);
          if (r.ok) s.setNotice("ยืนยันอีเมลเรียบร้อยแล้ว");
          else s.setError(r.message);
        }}
      >
        ยืนยันอีเมล
      </Button>
    </div>
  );
}
