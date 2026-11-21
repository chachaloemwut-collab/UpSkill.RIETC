"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, MailCheck } from "lucide-react";
import { api } from "@/lib/api";
import { validateProfile, type ProfileErrors } from "@upskill/core/profile";
import { PROFILE_PART_FIELDS, PdpaNotice, ProfileFields, readProfile, type ProfilePart } from "@/components/account/ProfileFields";
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
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: "สั้นเกินไป (ต้องมีอย่างน้อย 12 ตัว)", color: "bg-destructive", textColor: "text-destructive" },
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
      const mustChange = r.data.redirectTo.startsWith("/reset-password");
      await runScene(
        {
          icon: <LoginIcon play={1} />,
          title: mustChange ? "กรุณาตั้งรหัสผ่านใหม่" : "เข้าสู่ระบบสำเร็จ",
          subtitle: mustChange ? "คุณใช้รหัสผ่านชั่วคราว ต้องตั้งรหัสของตนเองก่อนใช้งาน" : r.data.redirectTo === "/admin" ? "กำลังพาไปยังระบบจัดการ" : "กำลังพาไปยังแดชบอร์ด",
        },
        1100,
      );
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
      {/* action: plain-form fallback when JavaScript did not run (older Safari / in-app browsers); onSubmit handles the normal case */}
      <form method="post" action="/api/auth/login/form" onSubmit={onSubmit} className="grid gap-4">
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
          <Input name="email" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" placeholder="you@example.com" required className="h-11" />
        </Field>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="text-sm font-medium leading-none">
              รหัสผ่าน
            </label>
            <Link href="/forgot-password" className="-my-2 -mr-2 inline-flex min-h-10 items-center px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              ลืมรหัสผ่าน?
            </Link>
          </div>
          <PasswordInput id="login-password" name="password" autoComplete="current-password" required className="h-11" />
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

const REGISTER_STEPS = [
  { title: "บัญชีผู้ใช้", hint: "อีเมลและรหัสผ่าน" },
  { title: "ข้อมูลผู้เรียน", hint: "ชื่อ เลขบัตร วันเกิด เบอร์โทร" },
  { title: "ที่อยู่และยืนยัน", hint: "ที่อยู่ติดต่อและความยินยอม" },
] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="ขั้นตอนการสมัคร">
      {REGISTER_STEPS.map((s, i) => {
        const state = i < step ? "done" : i === step ? "current" : "todo";
        return (
          <li key={s.title} aria-current={state === "current" ? "step" : undefined} className="grid gap-1.5">
            <span className={`h-1.5 rounded-full transition-colors duration-300 ${state === "todo" ? "bg-muted" : "bg-primary"}`} />
            <span className={`text-xs font-medium ${state === "current" ? "text-foreground" : "text-muted-foreground"}`}>
              {i + 1}. {s.title}
            </span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">{s.hint}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Sign-up in three short steps (account → learner details → address & consent). All inputs stay mounted in one
 * form, so values survive Back/Next and a single request is sent at the end; each step is checked with the same
 * rules as the server before moving on.
 */
export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const s = useSubmit();
  const [step, setStep] = useState(0);
  const [pwd, setPwd] = useState("");
  const [accountErrors, setAccountErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [consentError, setConsentError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);

  const top = () => formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  const focusFirstError = () =>
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>("fieldset:not(.hidden) [aria-invalid=true], fieldset:not(.hidden) .text-destructive");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });

  function checkAccount(f: FormData): boolean {
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const e: typeof accountErrors = {};
    if (!EMAIL_RE.test(email)) e.email = "กรอกอีเมลให้ถูกต้อง เช่น name@example.com";
    if (password.length < 12) e.password = "รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร";
    if (password !== f.get("confirm")) e.confirm = "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
    setAccountErrors(e);
    return Object.keys(e).length === 0;
  }

  /** Profile errors limited to one step's fields (all fields when part is undefined). */
  function checkProfile(f: FormData, part?: ProfilePart) {
    const checked = validateProfile(readProfile(f));
    const keys = part ? PROFILE_PART_FIELDS[part] : (Object.keys(checked.errors) as Array<keyof ProfileErrors>);
    const scoped = Object.fromEntries(keys.filter((k) => checked.errors[k]).map((k) => [k, checked.errors[k]])) as ProfileErrors;
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of part ? PROFILE_PART_FIELDS[part] : (Object.keys(prev) as Array<keyof ProfileErrors>)) delete next[k];
      return { ...next, ...scoped };
    });
    return { ok: Object.keys(scoped).length === 0, profile: checked.profile };
  }

  function next() {
    const form = formRef.current;
    if (!form) return;
    const f = new FormData(form);
    const ok = step === 0 ? checkAccount(f) : checkProfile(f, "identity").ok;
    if (!ok) {
      s.setError("กรุณาแก้ไขช่องที่มีข้อความสีแดง");
      focusFirstError();
      return;
    }
    s.setError(null);
    setStep((x) => Math.min(x + 1, REGISTER_STEPS.length - 1));
    top();
  }

  function back() {
    s.setError(null);
    setStep((x) => Math.max(0, x - 1));
    top();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step < REGISTER_STEPS.length - 1) return next(); // Enter key on an early step = Next
    const form = e.currentTarget;
    const f = new FormData(form);
    // Re-check everything: an earlier step may have been edited after moving on
    if (!checkAccount(f)) {
      setStep(0);
      s.setError("กรุณาตรวจสอบอีเมลและรหัสผ่าน");
      return;
    }
    if (!checkProfile(f, "identity").ok) {
      setStep(1);
      s.setError("กรุณาตรวจสอบข้อมูลผู้เรียน");
      focusFirstError();
      return;
    }
    const all = checkProfile(f);
    const consent = f.get("pdpaConsent") === "on";
    setConsentError(consent ? undefined : "ต้องยอมรับประกาศความเป็นส่วนตัวก่อนสมัครสมาชิก");
    if (!all.profile || !consent) {
      s.setError("กรุณาแก้ไขช่องที่มีข้อความสีแดง");
      focusFirstError();
      return;
    }
    s.setBusy(true);
    s.setError(null);
    const r = await api<{ message: string }>("/api/auth/register", {
      body: { email: f.get("email"), password: f.get("password"), profile: all.profile, pdpaConsent: consent },
    });
    s.setBusy(false);
    if (r.ok) s.setNotice(r.data.message);
    else {
      s.setError(r.message);
      top();
    }
  }

  if (s.notice)
    return (
      <div data-auth-wide className="grid justify-items-center gap-4 rounded-lg border bg-card p-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success [&>svg]:h-7 [&>svg]:w-7">
          <CheckDrawIcon play={1} />
        </span>
        <div>
          <p className="font-semibold">อีกขั้นเดียว: ยืนยันอีเมลของคุณ</p>
          <p className="mt-1 text-sm text-muted-foreground">{s.notice}</p>
          <p className="mt-2 text-xs text-muted-foreground">ไม่พบอีเมล? ลองดูในโฟลเดอร์จดหมายขยะ (Spam) หรือโปรโมชัน</p>
        </div>
        <Link href="/login" className={buttonClass("outline", "md")}>
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );

  const last = step === REGISTER_STEPS.length - 1;
  return (
    <div data-auth-wide className="grid gap-5">
      {googleEnabled && step === 0 && (
        <>
          <GoogleButton label="สมัครด้วยบัญชี Google (เร็วที่สุด)" />
          <OrDivider />
        </>
      )}
      <form ref={formRef} method="post" onSubmit={onSubmit} className="grid scroll-mt-24 gap-4" noValidate>
        <StepIndicator step={step} />
        {s.error && <Alert variant="destructive" title={s.error} />}

        <fieldset className={step === 0 ? "grid gap-4 rounded-lg border p-4" : "hidden"} aria-hidden={step !== 0 || undefined}>
          <legend className="px-1 text-sm font-semibold">บัญชีสำหรับเข้าสู่ระบบ</legend>
          <Field label="อีเมล" error={accountErrors.email} hint="ระบบจะส่งลิงก์ยืนยันไปที่อีเมลนี้ ต้องกดยืนยันก่อนจึงเข้าสู่ระบบได้">
            <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" required className="h-11" aria-invalid={!!accountErrors.email || undefined} />
          </Field>
          <Field label="รหัสผ่าน" error={accountErrors.password} hint="อย่างน้อย 12 ตัวอักษร เช่น วลีที่จำง่าย ‘ลอยกระทงปี2569สนุกมาก’">
            <PasswordInput
              name="password"
              autoComplete="new-password"
              minLength={12}
              required
              className="h-11"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              aria-invalid={!!accountErrors.password || undefined}
            />
            <PasswordStrengthMeter password={pwd} />
          </Field>
          <Field label="ยืนยันรหัสผ่าน" error={accountErrors.confirm}>
            <PasswordInput name="confirm" autoComplete="new-password" minLength={12} required className="h-11" aria-invalid={!!accountErrors.confirm || undefined} />
          </Field>
        </fieldset>

        <ProfileFields errors={errors} show={step === 1 ? "identity" : step === 2 ? "address" : "none"} />

        <div className={last ? "" : "hidden"}>
          <PdpaNotice error={consentError} />
        </div>

        <div className="flex items-center gap-3 pt-1">
          {step > 0 && (
            <Button type="button" variant="outline" size="lg" onClick={back} className="flex-1 sm:flex-none">
              <ChevronLeft className="h-4 w-4" /> ย้อนกลับ
            </Button>
          )}
          {/* Distinct keys: reusing one DOM button would turn the "Next" click into a submit of the last step */}
          {last ? (
            <Button key="submit" type="submit" size="lg" loading={s.busy} className="flex-1">
              สมัครสมาชิก
            </Button>
          ) : (
            <Button key="next" type="button" size="lg" onClick={next} className="flex-1">
              ถัดไป <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          ขั้นตอนที่ {step + 1} จาก {REGISTER_STEPS.length} · ข้อมูลที่กรอกไว้จะไม่หายเมื่อกดย้อนกลับ
        </p>
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
    const r = await api<{ message: string }>("/api/auth/forgot-password", { body: { email: String(f.get("email") ?? "").trim().toLowerCase() } });
    s.setBusy(false);
    if (r.ok) s.setNotice(r.data.message);
    else s.setError(r.message);
  }
  return (
    <div className="grid gap-6">
      <form method="post" onSubmit={onSubmit} className="grid gap-4">
        <p className="text-sm font-medium">รับลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล</p>
        <p className="-mt-2 text-xs text-muted-foreground">กรอกอีเมลหรือชื่อผู้ใช้ ระบบจะส่งลิงก์ไปที่อีเมลของบัญชี หากไม่ได้รับอีเมลหรือเข้าอีเมลไม่ได้ ติดต่อผู้ดูแลระบบเพื่อขอลิงก์หรือรหัสผ่านชั่วคราว</p>
        {s.notice && <Alert variant="success" title="ส่งคำขอแล้ว">{s.notice}</Alert>}
        {s.error && <Alert variant="destructive" title={s.error} />}
        <Field label="อีเมลหรือชื่อผู้ใช้">
          <Input name="email" type="text" autoComplete="username" placeholder="you@example.com" required className="h-10" />
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
