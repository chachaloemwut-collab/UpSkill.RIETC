"use client";
import { mailForm, passwordForm } from "@/app/(auth)/recovery/mail-actions";
import { maskEmail } from "@/lib/mask-email";
import { BrandSignal } from "@/components/brand/BrandActivity";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, MailCheck, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { validateProfile, type ProfileErrors } from "@upskill/core/profile";
import { ElectronicSignatureNotice, PROFILE_PART_FIELDS, PdpaNotice, ProfileFields, readProfile, type ProfilePart } from "@/components/account/ProfileFields";
import { ApplicationSheet, type ApplicationSheetData } from "@/components/account/ApplicationSheet";
import { errorMessage } from "@/lib/errors";
import { Alert, Button, CheckDrawIcon, Field, Input, PasswordInput, Separator, buttonClass, useActionScene, useToast } from "@/components/ui";

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
    <div className="mb-6 print:hidden">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function LoginForm({ googleEnabled, initialError, notice, initialIdentifier, returnTo }: { returnTo?:string | null; googleEnabled: boolean; initialError?: string | undefined; notice?: string | undefined; initialIdentifier?: string | undefined }) {
  const router = useRouter();
  const toast = useToast();
  const [scene, runScene] = useActionScene();
  const s = useSubmit();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ? errorMessage(initialError) : null);
  const [countdown, setCountdown] = useState<number | null>(null);
  // Set after a wrong password: offers the reset link for exactly the account the user typed
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState(Boolean(initialError));
  const [forgotFor, setForgotFor] = useState<string | null>(null);

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
          icon: <BrandSignal state="login-success" full />,
          title: mustChange ? "กรุณาตั้งรหัสผ่านใหม่" : "เข้าสู่ระบบสำเร็จ",
          subtitle: mustChange ? "คุณใช้รหัสผ่านชั่วคราว ต้องตั้งรหัสของตนเองก่อนใช้งาน" : r.data.redirectTo === "/admin" ? "กำลังพาไปยังระบบจัดการ" : "กำลังพาไปยังแดชบอร์ด",
        },
        1100,
      );
      router.replace(r.data.redirectTo === "/" && returnTo ? returnTo : r.data.redirectTo);
      router.refresh();
      return;
    }
    s.setBusy(false);
    setAuthError(r.status > 0 && r.status < 500);
    if (r.code === "RATE_LIMITED") {
      const sec = r.retryAfter && r.retryAfter > 0 ? r.retryAfter : 60;
      setCountdown(sec);
      setError(`ทำรายการบ่อยเกินไป กรุณารออีก ${sec} วินาทีแล้วลองใหม่`);
    } else {
      setCountdown(null);
      setError(r.message);
    }
    setUnverifiedEmail(r.code === "EMAIL_NOT_VERIFIED" ? String(f.get("email")).trim() : null);
    setForgotFor(r.code === "INVALID_CREDENTIALS" ? String(f.get("email") ?? "").trim() : null);
  }

  return (
    <div className="grid gap-5">
      {scene}
      {googleEnabled && (
        <>
          <div className="grid gap-2">
            <GoogleButton label="เข้าสู่ระบบด้วย Google" />
            <p className="text-sm text-muted-foreground">หากเคยสมัครด้วย Google ให้เลือกบัญชี Google เดิมที่ใช้สมัคร</p>
          </div>
          <OrDivider />
        </>
      )}
      {/* action: plain-form fallback when JavaScript did not run (older Safari / in-app browsers); onSubmit handles the normal case */}
      <form method="post" action="/api/auth/login/form" onSubmit={onSubmit} className="grid gap-4">
        {returnTo && <input type="hidden" name="next" value={returnTo}/>}
        {notice && !error && <Alert variant="success" title={notice} />}
        {error && (
          <Alert
            variant="destructive"
            {...(authError ? { brandState: "login-error" as const } : {})}
            title={
              countdown && countdown > 0
                ? `ทำรายการบ่อยเกินไป กรุณารออีก ${countdown} วินาทีแล้วลองใหม่`
                : error
            }
          />
        )}
        {(forgotFor || (initialError === "INVALID_CREDENTIALS" && error === errorMessage(initialError))) && (
          <div className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">จำรหัสผ่านไม่ได้?</p>
            <p className="text-muted-foreground">หากเคยตั้งรหัสผ่านกับระบบ ให้ขอลิงก์ตั้งรหัสผ่านใหม่โดยใช้อีเมลหรือชื่อผู้ใช้เดิม</p>
            <Link href="/forgot-password" className={buttonClass("outline", "md", "w-full")}>
              <MailCheck className="h-4 w-4" /> ไปหน้าตั้งรหัสผ่านใหม่
            </Link>
          </div>
        )}
        {unverifiedEmail && (
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              const response = await api("/api/auth/resend-verification", { body: { email: unverifiedEmail } });
              setError(null);
              if (!response.ok) { setError(response.message); return; }
              setUnverifiedEmail(null);
              toast({ brandState: "verify-email", title: "รับคำขอส่งลิงก์ยืนยันแล้ว", description: `ตรวจสอบกล่องอีเมล ${maskEmail(unverifiedEmail)}`, variant: "success" });
            }}
          >
            <MailCheck className="h-4 w-4" /> ส่งลิงก์ยืนยันอีเมลอีกครั้ง
          </Button>
        )}
        <div className="grid gap-1.5">
          <label htmlFor="login-identifier" className="text-sm font-medium">อีเมลหรือชื่อผู้ใช้</label>
          <Input id="login-identifier" name="email" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" enterKeyHint="next" placeholder="you@example.com" required className="h-11" defaultValue={initialIdentifier} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="login-password" className="text-sm font-medium">รหัสผ่าน</label>
          <Input id="login-password" type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" enterKeyHint="go" required className="h-11" />
        </div>
        <Button
          type="submit"
          size="lg"
          loading={s.busy} loadingState="login-loading"
          disabled={Boolean(countdown && countdown > 0)}
          className="w-full"
        >
          {countdown && countdown > 0 ? `กรุณารออีก ${countdown} วินาที...` : "เข้าสู่ระบบ"}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" aria-controls="login-password" aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)} className="min-h-10 rounded px-1 text-muted-foreground hover:text-foreground focus-visible:outline-ring">
            {showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          </button>
          <Link href="/forgot-password" className="inline-flex min-h-10 items-center rounded px-1 text-muted-foreground hover:underline">
            ลืมรหัสผ่านหรือจำอีเมลไม่ได้?
          </Link>
        </div>
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
  const [sheet, setSheet] = useState<ApplicationSheetData | null>(null);
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
      // The server validates again, so it needs the applicant's guardian confirmation too: the normalized profile
      // does not carry it, and without it every applicant under 20 was refused.
      body: { email: f.get("email"), password: f.get("password"), profile: { ...all.profile, guardianConsent: f.get("guardianConsent") === "on" }, pdpaConsent: consent },
    });
    s.setBusy(false);
    if (r.ok) {
      const pr = all.profile;
      setSheet({
        email: String(f.get("email") ?? "").trim(),
        titleTh: pr.titleTh, firstNameTh: pr.firstNameTh, lastNameTh: pr.lastNameTh,
        titleEn: pr.titleEn, firstNameEn: pr.firstNameEn, lastNameEn: pr.lastNameEn,
        birthDate: pr.birthDate, nationalIdLast4: pr.nationalId.slice(-4), phone: pr.phone,
        addressLine: pr.addressLine, subdistrict: pr.subdistrict, district: pr.district, province: pr.province, postalCode: pr.postalCode,
        guardianName: pr.guardianName, submittedAt: new Date(),
      });
      s.setNotice(`${r.data.message} ${maskEmail(String(f.get("email") ?? ""))}`);
    }
    else {
      s.setError(r.message);
      top();
    }
  }

  if (s.notice)
    return (
      <>
      {sheet && <div className="hidden print:block"><ApplicationSheet data={sheet} /></div>}
      <div data-auth-wide className="grid justify-items-center gap-4 rounded-lg border bg-card p-8 text-center print:hidden">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success [&>svg]:h-7 [&>svg]:w-7">
          <CheckDrawIcon play={1} />
        </span>
        <div>
          <p className="font-semibold">อีกขั้นเดียว: ยืนยันอีเมลของคุณ</p>
          <p className="mt-1 text-sm text-muted-foreground">{s.notice}</p>
          <p className="mt-2 text-xs text-muted-foreground">ไม่พบอีเมล? ลองดูในโฟลเดอร์จดหมายขยะ (Spam) หรือโปรโมชัน</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {sheet && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> พิมพ์ใบสมัคร
            </Button>
          )}
          <Link href="/login" className={buttonClass("default", "md")}>
            ไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">พิมพ์ใบสมัครย้อนหลังได้ทุกเมื่อที่เมนู ข้อมูลผู้เรียน → พิมพ์ใบสมัคร</p>
      </div>
      </>
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
          <div className="grid gap-3">
            <PdpaNotice error={consentError} />
            <ElectronicSignatureNotice />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          {step > 0 && (
            <Button type="button" variant="outline" size="lg" onClick={back} className="flex-1 sm:flex-none">
              <ChevronLeft className="h-4 w-4" /> ย้อนกลับ
            </Button>
          )}
          {/* Distinct keys: reusing one DOM button would turn the "Next" click into a submit of the last step */}
          {last ? (
            <Button key="submit" type="submit" size="lg" loading={s.busy} loadingState="register" className="flex-1">
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

function AccountRecoveryHelp() {
  return <section className="grid gap-2 rounded-lg border p-4">
    <h2 className="font-semibold">จำอีเมลเดิมไม่ได้หรือเข้าอีเมลไม่ได้</h2>
    <p className="text-sm">แจ้งงานทะเบียนผ่านแบบฟอร์มได้แม้ยังเข้าสู่ระบบไม่ได้ เก็บเลขเรื่องและรหัสติดตามเพื่อดูผล เจ้าหน้าที่จะนัดตรวจตัวตนก่อนคืนสิทธิ์บัญชีเดิม</p>
    <Link href="/recovery" className="font-medium underline">แจ้งเรื่องหรือติดตามการกู้บัญชี</Link>
    <a className="text-sm underline" href="tel:038685383">โทรหาวิทยาลัย 038-685383</a>
  </section>;
}

function OpenRecoveryLink() {
  const router = useRouter();
  const [error, setError] = useState(false);
  function open(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("recovery") ?? "").trim();
    const pattern = /^[A-Za-z0-9_-]{40,64}$/;
    let token = value;
    if (!pattern.test(token)) {
      try {
        const url = new URL(value);
        token = url.origin === window.location.origin && url.pathname === "/reset-password"
          ? url.searchParams.get("token") ?? "" : "";
      } catch { token = ""; }
    }
    if (!pattern.test(token)) { setError(true); return; }
    router.push("/reset-password?token=" + encodeURIComponent(token));
  }
  return <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">มีลิงก์แล้วแต่กดเปิดไม่ได้</summary>
    <form method="post" onSubmit={open} className="mt-3 grid gap-3">
      <Field label="ลิงก์หรือรหัสตั้งรหัสผ่าน" hint="คัดลอกลิงก์ที่ได้รับมาวาง หรือกรอกรหัสหลังคำว่า token=">
        <Input name="recovery" type="password" autoComplete="off" spellCheck={false} required maxLength={2048} />
      </Field>
      {error && <p role="alert">กรุณาวางลิงก์ตั้งรหัสผ่านของระบบนี้ให้ครบ หรือวางเฉพาะรหัสที่ได้รับ</p>}
      <Button type="submit" variant="outline">เปิดหน้าตั้งรหัสผ่าน</Button>
    </form></details>;
}

const RESEND_AFTER_SEC = 60;

/**
 * Self-service reset: email or username → link by email. After sending it shows what to do next (inbox, spam,
 * 1-hour single-use link), a resend button with a short cooldown, and where to get help without email access.
 * The reply is the same whether or not the account exists, so it never reveals who is registered.
 */
export function ForgotPasswordForm({ googleEnabled, emailAvailable, initialIdentifier }: { googleEnabled: boolean; emailAvailable: boolean; initialIdentifier?: string | undefined }) {
  const s = useSubmit();
  const [fallbackMessage, fallback] = useActionState(mailForm,"");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send(identifier: string) {
    s.setBusy(true);
    s.setError(null);
    const r = await api<{ message: string }>("/api/auth/forgot-password", { body: { email: identifier.trim().toLowerCase() } });
    s.setBusy(false);
    if (r.ok) {
      setSentTo(identifier.trim());
      setWait(RESEND_AFTER_SEC);
      return true;
    }
    s.setError(r.code === "VALIDATION_FAILED" ? "กรอกอีเมล (เช่น name@example.com) หรือชื่อผู้ใช้ให้ถูกต้อง" : r.message);
    if (r.code === "RATE_LIMITED") setWait(r.retryAfter && r.retryAfter > 0 ? r.retryAfter : RESEND_AFTER_SEC);
    return false;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await send(String(new FormData(e.currentTarget).get("email") ?? ""));
  }

  if (sentTo)
    return (
      <div className="grid gap-5">
        <div className="grid justify-items-center gap-3 rounded-lg border bg-card p-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <BrandSignal state="verify-email" broadcast className="size-10" />
          </span>
          <div>
            <p className="font-semibold">ตรวจสอบอีเมลของคุณ</p>
            <p className="mt-1 text-sm text-muted-foreground">
              หากข้อมูลตรงกับบัญชีที่กู้คืนได้ ระบบจะส่งลิงก์ไปที่ <span className="font-medium text-foreground">{maskEmail(sentTo)}</span>
            </p>
          </div>
        </div>
        <ol className="grid gap-2 text-sm">
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span><span>เปิดอีเมลชื่อ “ลิงก์ตั้งรหัสผ่านใหม่” แล้วกดปุ่ม <b>ตั้งรหัสผ่านใหม่</b></span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span><span>ไม่พบใน 2–3 นาที? ดูในโฟลเดอร์จดหมายขยะ (Spam) หรือโปรโมชัน</span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span><span>ลิงก์ใช้ได้ 1 ชั่วโมงและใช้ได้ครั้งเดียว ถ้าขอหลายครั้ง ให้ใช้อีเมลฉบับล่าสุด</span></li>
        </ol>
        {s.error && <Alert variant="destructive" title={s.error} />}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" size="lg" loading={s.busy} loadingState="verify-email" disabled={wait > 0} onClick={() => void send(sentTo)}>
            {wait > 0 ? `ส่งอีกครั้งได้ใน ${wait} วินาที` : "ส่งอีเมลอีกครั้ง"}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => { setSentTo(null); s.setError(null); }}>
            ใช้อีเมลหรือชื่อผู้ใช้อื่น
          </Button>
        </div>
        <OpenRecoveryLink />
        <AccountRecoveryHelp />
        <Link href="/login" className={buttonClass("default", "lg", "w-full")}>
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );

  return (
    <div className="grid gap-6">
      {emailAvailable && <form action={fallback} onSubmit={onSubmit} className="grid gap-4">
        {fallbackMessage && <p role="status">{fallbackMessage}</p>}
        {s.error && <Alert variant="destructive" title={wait > 0 ? `ขอลิงก์บ่อยเกินไป กรุณารออีก ${wait} วินาที` : s.error} />}
        <Field label="อีเมลหรือชื่อผู้ใช้" hint="กรอกอีเมลหลัก อีเมลสำรองที่ยืนยันแล้ว หรือชื่อผู้ใช้ หากใช้ชื่อผู้ใช้ ระบบจะส่งไปอีเมลหลัก">
          <Input
            name="email"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            placeholder="you@example.com"
            required
            autoFocus={!initialIdentifier}
            defaultValue={initialIdentifier}
            className="h-11"
          />
        </Field>
        <Button type="submit" size="lg" loading={s.busy} loadingState="verify-email" disabled={wait > 0} className="w-full">
          <MailCheck className="h-4 w-4" /> ส่งลิงก์ตั้งรหัสผ่านใหม่
        </Button>
        <p className="text-xs text-muted-foreground">ลิงก์จะส่งไปที่อีเมลของบัญชี ใช้ได้ 1 ชั่วโมง รหัสผ่านเดิมยังใช้ได้จนกว่าคุณจะตั้งรหัสใหม่</p>
      </form>}
      <OpenRecoveryLink />
      <AccountRecoveryHelp />
      {googleEnabled && (
        <div className="grid gap-3">
          <OrDivider />
          <p className="text-sm text-muted-foreground">บัญชีที่ผูกกับ Google ไว้แล้ว ยืนยันตัวตนด้วย Google เพื่อตั้งรหัสผ่านใหม่ได้ทันที</p>
          <GoogleButton mode="reset" label="ยืนยันตัวตนด้วย Google" />
        </div>
      )}
      <Link href="/login" className="inline-flex min-h-10 items-center justify-center text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        ← กลับไปหน้าเข้าสู่ระบบ
      </Link>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [fallbackMessage,fallback] = useActionState(passwordForm,"");
  const router = useRouter();
  const s = useSubmit();
  const [pwd, setPwd] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [expired, setExpired] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setMismatch(true);
    setMismatch(false);
    s.setBusy(true);
    s.setError(null);
    const r = await api("/api/auth/reset-password", { body: { token, new_password: f.get("password") } });
    s.setBusy(false);
    if (r.ok) {
      s.setNotice("ตั้งรหัสผ่านใหม่แล้ว");
      setTimeout(() => {
        router.replace("/login?reset=1");
        router.refresh();
      }, 1200);
    } else {
      setExpired(r.code === "INVALID_OR_EXPIRED_TOKEN");
      s.setError(r.message);
    }
  }
  if (s.notice) return <Alert variant="success" title="ตั้งรหัสผ่านใหม่แล้ว">กำลังพาไปหน้าเข้าสู่ระบบ ใช้รหัสผ่านใหม่เข้าสู่ระบบได้เลย</Alert>;
  if (expired) return <ResetLinkExpired />;
  return (
    <form action={fallback} onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="token" value={token}/>
      {fallbackMessage && <p role="alert">{fallbackMessage}</p>}
      {s.error && <Alert variant="destructive" title={s.error} />}
      <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 12 ตัวอักษร ใช้วลีที่จำง่ายได้ เช่น ‘ลอยกระทงปี2569สนุกมาก’">
        <PasswordInput name="password" autoComplete="new-password" minLength={12} required autoFocus className="h-11" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <PasswordStrengthMeter password={pwd} />
      </Field>
      <Field label="ยืนยันรหัสผ่านใหม่" error={mismatch ? "รหัสผ่านทั้งสองช่องไม่ตรงกัน" : undefined}>
        <PasswordInput name="confirm" autoComplete="new-password" minLength={12} required className="h-11" />
      </Field>
      <Button type="submit" size="lg" loading={s.busy} loadingState="saving" className="w-full">
        ตั้งรหัสผ่านใหม่
      </Button>
    </form>
  );
}

/** Shown instead of the form when the link is expired, already used or mistyped. */
export function ResetLinkExpired() {
  return (
    <div className="grid gap-4">
      <Alert variant="warning" title="ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว">
        โปรดตรวจว่าคัดลอกลิงก์มาครบ ลิงก์แต่ละฉบับใช้ได้ครั้งเดียวภายในเวลาที่ระบุ
      </Alert>
      <Link href="/forgot-password" className={buttonClass("default", "lg", "w-full")}>
        <MailCheck className="h-4 w-4" /> เลือกวิธีกู้บัญชี
      </Link>
      <Link href="/login" className={buttonClass("ghost", "lg", "w-full")}>
        กลับไปหน้าเข้าสู่ระบบ
      </Link>
    </div>
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
        loading={s.busy} loadingState="verify-email"
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
