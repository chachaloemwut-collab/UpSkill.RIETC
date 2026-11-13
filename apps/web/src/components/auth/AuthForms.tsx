"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { Alert, Button, CheckDrawIcon, Field, Input, LoginIcon, PasswordInput, Separator, buttonClass, useActionScene, useToast } from "@/components/ui";

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return { busy, setBusy, error, setError, notice, setNotice };
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.8-6-6.2s2.7-6.2 6-6.2c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 2.8 14.7 1.8 12 1.8 6.5 1.8 2 6.3 2 11.8s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12Z" />
    </svg>
  );
}

function GoogleButton({ mode = "login", label }: { mode?: "login" | "reset"; label: string }) {
  // Full-page navigation (not fetch): the OAuth flow is a chain of top-level redirects
  return (
    <a href={`/api/auth/google?mode=${mode}`} className={buttonClass("outline", "lg", "w-full")}>
      <GoogleMark /> {label}
    </a>
  );
}

function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <Separator className="flex-1" /> หรือ <Separator className="flex-1" />
    </div>
  );
}

export function AuthHeading({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function LoginForm({ googleEnabled, initialError }: { googleEnabled: boolean; initialError?: string | undefined }) {
  const router = useRouter();
  const toast = useToast();
  const [scene, runScene] = useActionScene();
  const s = useSubmit();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ? errorMessage(initialError) : null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    s.setBusy(true);
    setError(null);
    const r = await api("/api/auth/login", { body: { email: f.get("email"), password: f.get("password") } });
    if (r.ok) {
      await runScene({ icon: <LoginIcon play={1} />, title: "เข้าสู่ระบบสำเร็จ", subtitle: "กำลังพาไปยังแดชบอร์ด" }, 1100);
      router.push("/");
      router.refresh();
      return;
    }
    s.setBusy(false);
    setError(r.message);
    if (r.code === "EMAIL_NOT_VERIFIED") setUnverifiedEmail(String(f.get("email")));
  }

  return (
    <div className="grid gap-5">
      {scene}
      {googleEnabled && (
        <>
          <GoogleButton label="เข้าสู่ระบบด้วย Google" />
          <OrDivider />
        </>
      )}
      <form onSubmit={onSubmit} className="grid gap-4">
        {error && <Alert variant="destructive" title={error} />}
        {unverifiedEmail && (
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await api("/api/auth/resend-verification", { body: { email: unverifiedEmail } });
              setError(null);
              setUnverifiedEmail(null);
              toast({ title: "ส่งลิงก์ยืนยันใหม่แล้ว", description: "กรุณาตรวจสอบกล่องอีเมลของคุณ", variant: "success" });
            }}
          >
            <MailCheck className="h-4 w-4" /> ส่งลิงก์ยืนยันอีเมลอีกครั้ง
          </Button>
        )}
        <Field label="อีเมล">
          <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" required className="h-10" />
        </Field>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="text-sm font-medium leading-none">
              รหัสผ่าน
            </label>
            <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              ลืมรหัสผ่าน?
            </Link>
          </div>
          <PasswordInput id="login-password" name="password" autoComplete="current-password" required className="h-10" />
        </div>
        <Button type="submit" size="lg" loading={s.busy} className="w-full">
          เข้าสู่ระบบ
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        ยังไม่มีบัญชี?{" "}
        <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
          สมัครสมาชิกฟรี
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const s = useSubmit();
  const [mismatch, setMismatch] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setMismatch(true);
    setMismatch(false);
    s.setBusy(true);
    s.setError(null);
    const r = await api<{ message: string }>("/api/auth/register", { body: { email: f.get("email"), password: f.get("password") } });
    s.setBusy(false);
    if (r.ok) s.setNotice(r.data.message);
    else s.setError(r.message);
  }
  if (s.notice)
    return (
      <div className="grid justify-items-center gap-4 rounded-lg border bg-card p-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success [&>svg]:h-7 [&>svg]:w-7">
          <CheckDrawIcon play={1} />
        </span>
        <div>
          <p className="font-semibold">ตรวจสอบกล่องอีเมลของคุณ</p>
          <p className="mt-1 text-sm text-muted-foreground">{s.notice}</p>
        </div>
        <Link href="/login" className={buttonClass("outline", "md")}>
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  return (
    <div className="grid gap-5">
      {googleEnabled && (
        <>
          <GoogleButton label="สมัครด้วย Google" />
          <OrDivider />
        </>
      )}
      <form onSubmit={onSubmit} className="grid gap-4">
        {s.error && <Alert variant="destructive" title={s.error} />}
        <Field label="อีเมล">
          <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" required className="h-10" />
        </Field>
        <Field label="รหัสผ่าน" hint="อย่างน้อย 12 ตัวอักษร แนะนำให้ใช้วลีที่จำง่ายแต่เดายาก">
          <PasswordInput name="password" autoComplete="new-password" minLength={12} required className="h-10" />
        </Field>
        <Field label="ยืนยันรหัสผ่าน" error={mismatch ? "รหัสผ่านทั้งสองช่องไม่ตรงกัน" : undefined}>
          <PasswordInput name="confirm" autoComplete="new-password" minLength={12} required className="h-10" aria-invalid={mismatch || undefined} />
        </Field>
        <Button type="submit" size="lg" loading={s.busy} className="w-full">
          สมัครสมาชิก
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        มีบัญชีแล้ว?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm({ googleEnabled }: { googleEnabled: boolean }) {
  const s = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    s.setBusy(true);
    s.setError(null);
    const r = await api<{ message: string }>("/api/auth/forgot-password", { body: { email: f.get("email") } });
    s.setBusy(false);
    if (r.ok) s.setNotice(r.data.message);
    else s.setError(r.message);
  }
  return (
    <div className="grid gap-6">
      <form onSubmit={onSubmit} className="grid gap-4">
        <p className="text-sm font-medium">รับลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล</p>
        {s.notice && <Alert variant="success" title="ส่งคำขอแล้ว">{s.notice}</Alert>}
        {s.error && <Alert variant="destructive" title={s.error} />}
        <Field label="อีเมล">
          <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" required className="h-10" />
        </Field>
        <Button type="submit" size="lg" loading={s.busy} className="w-full">
          ส่งลิงก์ตั้งรหัสผ่านใหม่
        </Button>
      </form>
      {googleEnabled && (
        <div className="grid gap-3">
          <OrDivider />
          <p className="text-sm text-muted-foreground">บัญชีที่ผูกกับ Google ไว้แล้ว ยืนยันตัวตนด้วย Google เพื่อตั้งรหัสผ่านใหม่ได้ทันที</p>
          <GoogleButton mode="reset" label="ยืนยันตัวตนด้วย Google" />
        </div>
      )}
      <Link href="/login" className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        ← กลับไปหน้าเข้าสู่ระบบ
      </Link>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const s = useSubmit();
  const [mismatch, setMismatch] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setMismatch(true);
    setMismatch(false);
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
  if (s.notice) return <Alert variant="success" title="สำเร็จ">{s.notice}</Alert>;
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {s.error && <Alert variant="destructive" title={s.error} />}
      <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 12 ตัวอักษร">
        <PasswordInput name="password" autoComplete="new-password" minLength={12} required className="h-10" />
      </Field>
      <Field label="ยืนยันรหัสผ่านใหม่" error={mismatch ? "รหัสผ่านทั้งสองช่องไม่ตรงกัน" : undefined}>
        <PasswordInput name="confirm" autoComplete="new-password" minLength={12} required className="h-10" />
      </Field>
      <Button type="submit" size="lg" loading={s.busy} className="w-full">
        ตั้งรหัสผ่านใหม่
      </Button>
    </form>
  );
}

export function VerifyEmailButton({ token }: { token: string }) {
  const s = useSubmit();
  if (s.notice)
    return (
      <div className="grid gap-4">
        <Alert variant="success" title={s.notice} />
        <Link href="/login" className={buttonClass("default", "lg", "w-full")}>
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  return (
    <div className="grid gap-4">
      {s.error && <Alert variant="destructive" title={s.error} />}
      <Button
        size="lg"
        className="w-full"
        loading={s.busy}
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
