"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { api } from "@/lib/api";
import { validateProfile, type ProfileErrors } from "@upskill/core/profile";
import { PdpaNotice, ProfileFields, readProfile } from "@/components/account/ProfileFields";
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
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: "รหัสผ่านสั้นเกินไป", color: "bg-destructive", textColor: "text-destructive" },
    { label: "ความปลอดภัยระดับเริ่มต้น", color: "bg-destructive", textColor: "text-destructive" },
    { label: "ความปลอดภัยปานกลาง", color: "bg-amber-500", textColor: "text-amber-500" },
    { label: "ความปลอดภัยดี", color: "bg-primary", textColor: "text-primary" },
    { label: "ความปลอดภัยสูงมาก", color: "bg-success", textColor: "text-success" },
  ] as const;

  const current = levels[Math.min(score, levels.length - 1)] ?? levels[0];

  return (
    <div className="mt-2 space-y-1.5 animate-fade-in" aria-live="polite">
      <div className="flex gap-1.5 h-1.5">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`flex-1 rounded-full transition-all duration-300 ${score >= step ? current.color : "bg-muted"}`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">ระดับความปลอดภัย:</span>
        <span className={`font-medium ${current.textColor}`}>{current.label}</span>
      </div>
    </div>
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
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!countdown || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (!prev || prev <= 1) {
          setError(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (countdown && countdown > 0) return;
    const f = new FormData(e.currentTarget);
    s.setBusy(true);
    setError(null);
    const r = await api<{ redirectTo: string }>("/api/auth/login", { body: { email: f.get("email"), password: f.get("password") } });
    if (r.ok) {
      await runScene({ icon: <LoginIcon play={1} />, title: "เข้าสู่ระบบสำเร็จ", subtitle: r.data.redirectTo === "/admin" ? "กำลังพาไปยังระบบจัดการ" : "กำลังพาไปยังแดชบอร์ด" }, 1100);
      router.replace(r.data.redirectTo);
      router.refresh();
      return;
    }
    s.setBusy(false);
    if (r.code === "RATE_LIMITED") {
      const sec = r.retryAfter && r.retryAfter > 0 ? r.retryAfter : 60;
      setCountdown(sec);
      setError(`ทำรายการบ่อยเกินไป กรุณารออีก ${sec} วินาทีแล้วลองใหม่`);
    } else {
      setCountdown(null);
      setError(r.message);
    }
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
      <form method="post" onSubmit={onSubmit} className="grid gap-4">
        {error && (
          <Alert
            variant="destructive"
            title={
              countdown && countdown > 0
                ? `ทำรายการบ่อยเกินไป กรุณารออีก ${countdown} วินาทีแล้วลองใหม่`
                : error
            }
          />
        )}
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
        <Field label="อีเมลหรือชื่อผู้ใช้">
          <Input name="email" type="text" autoComplete="username" placeholder="you@example.com" required className="h-10" />
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
        <Button
          type="submit"
          size="lg"
          loading={s.busy}
          disabled={Boolean(countdown && countdown > 0)}
          className="w-full"
        >
          {countdown && countdown > 0 ? `กรุณารออีก ${countdown} วินาที...` : "เข้าสู่ระบบ"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        ยังไม่มีบัญชี?{" "}
        <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
          สมัครสมาชิก
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const s = useSubmit();
  const [pwd, setPwd] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [consentError, setConsentError] = useState<string | undefined>();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("password") !== f.get("confirm")) return setMismatch(true);
    setMismatch(false);
    // Same rules as the server, so mistakes show next to their field before anything is sent
    const profile = readProfile(f);
    const checked = validateProfile(profile);
    setErrors(checked.errors);
    const consent = f.get("pdpaConsent") === "on";
    setConsentError(consent ? undefined : "ต้องยอมรับประกาศความเป็นส่วนตัวก่อนสมัครสมาชิก");
    if (!checked.profile || !consent) {
      s.setError("กรุณาตรวจสอบข้อมูลที่ไฮไลต์");
      form.querySelector("[aria-invalid=true], .text-destructive")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    s.setBusy(true);
    s.setError(null);
    const r = await api<{ message: string }>("/api/auth/register", {
      body: { email: f.get("email"), password: f.get("password"), profile, pdpaConsent: consent },
    });
    s.setBusy(false);
    if (r.ok) s.setNotice(r.data.message);
    else {
      s.setError(r.message);
      form.scrollIntoView({ block: "start", behavior: "smooth" });
    }
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
      <form method="post" onSubmit={onSubmit} className="grid gap-4" noValidate>
        {s.error && <Alert variant="destructive" title={s.error} />}
        <fieldset className="grid gap-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">บัญชีสำหรับเข้าสู่ระบบ</legend>
          <Field label="อีเมล" hint="ใช้เข้าสู่ระบบ ระบบจะส่งลิงก์ยืนยันไปที่อีเมลนี้ ต้องยืนยันก่อนจึงเข้าสู่ระบบได้">
            <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" required className="h-10" />
          </Field>
          <Field label="รหัสผ่าน" hint="อย่างน้อย 12 ตัวอักษร แนะนำให้ใช้วลีที่จำง่ายแต่เดายาก">
            <PasswordInput
              name="password"
              autoComplete="new-password"
              minLength={12}
              required
              className="h-10"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
            />
            <PasswordStrengthMeter password={pwd} />
          </Field>
          <Field label="ยืนยันรหัสผ่าน" error={mismatch ? "รหัสผ่านทั้งสองช่องไม่ตรงกัน" : undefined}>
            <PasswordInput name="confirm" autoComplete="new-password" minLength={12} required className="h-10" aria-invalid={mismatch || undefined} />
          </Field>
        </fieldset>
        <ProfileFields errors={errors} />
        <PdpaNotice error={consentError} />
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
      <form method="post" onSubmit={onSubmit} className="grid gap-4">
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
    <form method="post" onSubmit={onSubmit} className="grid gap-4">
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
