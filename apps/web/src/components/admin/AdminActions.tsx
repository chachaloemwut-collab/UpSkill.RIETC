"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Ban, BadgeCheck, ExternalLink, MoreHorizontal, Pause, Pencil, Play, RotateCcw, Save, Send, UserCog } from "lucide-react";
import { api } from "@/lib/api";
import { ReassignInstructorDialog, type InstructorOption } from "./CourseOwnerActions";
import { Alert, AlertDialog, Badge, Button, Checkbox, DropdownMenu, Field, Input, PasswordInput, Select, Textarea, useToast } from "@/components/ui";

type EmailSettingsDefaults = {
  enabled: boolean;
  senderName: string;
  senderEmail: string;
  replyToEmail: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "none" | "starttls" | "tls";
  smtpUsername: string;
  passwordConfigured: boolean;
  source: "environment" | "database";
  version: number;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
};

type GoogleOAuthSettingsDefaults = {
  enabled: boolean;
  clientId: string;
  secretConfigured: boolean;
  redirectUri: string;
  source: "environment" | "database";
  version: number;
};

export function GoogleOAuthSettingsForm({ defaults }: { defaults: GoogleOAuthSettingsDefaults }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const result = await api("/api/admin/google/settings", {
      method: "PATCH",
      body: {
        enabled: f.get("enabled") === "on",
        clientId: f.get("clientId"),
        ...(f.get("clientSecret") ? { clientSecret: f.get("clientSecret") } : {}),
      },
    });
    setBusy(false);
    if (result.ok) {
      toast({ title: "บันทึกการเข้าสู่ระบบด้วย Google แล้ว", description: "หน้าสมัครสมาชิกและเข้าสู่ระบบจะใช้ค่าใหม่ทันที", variant: "success" });
      router.refresh();
    } else toast({ title: "บันทึกไม่สำเร็จ", description: result.message, variant: "destructive" });
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-5 p-5">
      {defaults.source === "environment" && <Alert variant="default" title="ยังไม่ได้บันทึกจากหน้าผู้ดูแล">กรอกค่าจาก Google Cloud แล้วบันทึกเพื่อเปิดใช้งาน</Alert>}
      <Checkbox name="enabled" defaultChecked={defaults.enabled} label="เปิดให้สมัครสมาชิกและเข้าสู่ระบบด้วย Google" />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Google Client ID"><Input name="clientId" defaultValue={defaults.clientId} autoComplete="off" placeholder="000000000000-xxxx.apps.googleusercontent.com" /></Field>
        <Field label="Google Client Secret" hint={defaults.secretConfigured ? "มีค่าลับอยู่แล้ว เว้นว่างเพื่อใช้ค่าเดิม" : "ค่านี้จะถูกเข้ารหัสก่อนจัดเก็บ"}>
          <PasswordInput name="clientSecret" autoComplete="new-password" placeholder={defaults.secretConfigured ? "••••••••••••" : ""} />
        </Field>
      </div>
      <Field label="Authorized redirect URI" hint="นำ URL นี้ไปเพิ่มใน OAuth Client ของ Google Cloud">
        <Input value={defaults.redirectUri} readOnly className="font-mono text-xs" />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={busy}><Save className="h-4 w-4" /> บันทึก Google OAuth</Button>
        {defaults.enabled && defaults.secretConfigured && <a href="/api/auth/google?mode=login" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-accent"><ExternalLink className="h-4 w-4" /> ทดลองเชื่อมต่อ Google</a>}
      </div>
    </form>
  );
}

export function EmailSettingsForm({ defaults }: { defaults: EmailSettingsDefaults }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const result = await api("/api/admin/email/settings", {
      method: "PATCH",
      body: {
        enabled: f.get("enabled") === "on",
        senderName: f.get("senderName"),
        senderEmail: f.get("senderEmail"),
        replyToEmail: f.get("replyToEmail"),
        smtpHost: f.get("smtpHost"),
        smtpPort: Number(f.get("smtpPort")),
        smtpSecurity: f.get("smtpSecurity"),
        smtpUsername: f.get("smtpUsername"),
        ...(f.get("smtpPassword") ? { smtpPassword: f.get("smtpPassword") } : {}),
      },
    });
    setBusy(false);
    if (result.ok) {
      toast({ title: "บันทึกการตั้งค่าอีเมลแล้ว", description: "ระบบส่งอีเมลจะใช้ค่าใหม่โดยไม่ต้องรีสตาร์ต", variant: "success" });
      e.currentTarget.reset();
      router.refresh();
    } else toast({ title: "บันทึกไม่สำเร็จ", description: result.message, variant: "destructive" });
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-5 p-5">
      {defaults.source === "environment" && <Alert variant="default" title="กำลังใช้ค่าจากเซิร์ฟเวอร์">เมื่อบันทึก แบบฟอร์มนี้จะเป็นค่าหลักของระบบ</Alert>}
      <Checkbox name="enabled" defaultChecked={defaults.enabled} label="เปิดการส่งอีเมลจากระบบ" />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="ชื่อผู้ส่ง"><Input name="senderName" defaultValue={defaults.senderName} required maxLength={255} /></Field>
        <Field label="อีเมลผู้ส่ง"><Input name="senderEmail" type="email" defaultValue={defaults.senderEmail} required /></Field>
        <Field label="อีเมลสำหรับตอบกลับ" hint="เว้นว่างเพื่อให้ตอบกลับไปยังอีเมลผู้ส่ง"><Input name="replyToEmail" type="email" defaultValue={defaults.replyToEmail ?? ""} /></Field>
      </div>
      <div className="border-t pt-5">
        <h4 className="mb-4 text-sm font-semibold">การเชื่อมต่อ SMTP</h4>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="SMTP host"><Input name="smtpHost" defaultValue={defaults.smtpHost} required placeholder="smtp.example.com" /></Field>
          <Field label="พอร์ต"><Input name="smtpPort" type="number" min={1} max={65535} defaultValue={defaults.smtpPort} required /></Field>
          <Field label="ความปลอดภัย"><Select name="smtpSecurity" defaultValue={defaults.smtpSecurity}><option value="starttls">STARTTLS</option><option value="tls">TLS/SSL</option><option value="none">ไม่มีการเข้ารหัส</option></Select></Field>
          <Field label="ชื่อผู้ใช้ SMTP"><Input name="smtpUsername" autoComplete="off" defaultValue={defaults.smtpUsername} /></Field>
          <Field label="รหัสผ่าน SMTP" hint={defaults.passwordConfigured ? "มีรหัสผ่านอยู่แล้ว เว้นว่างเพื่อใช้ค่าเดิม" : "จำเป็นเมื่อกำหนดชื่อผู้ใช้ SMTP"}>
            <PasswordInput name="smtpPassword" autoComplete="new-password" placeholder={defaults.passwordConfigured ? "••••••••••••" : ""} />
          </Field>
        </div>
      </div>
      <Button type="submit" loading={busy} className="justify-self-start"><Save className="h-4 w-4" /> บันทึกการตั้งค่า</Button>
    </form>
  );
}

export function TestEmailSettingsForm({ lastStatus, lastError }: { lastStatus: string | null; lastError: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const result = await api("/api/admin/email/settings/test", { body: { recipient: f.get("recipient") } });
    setBusy(false);
    if (result.ok) toast({ title: "ส่งอีเมลทดสอบแล้ว", variant: "success" });
    else toast({ title: "ทดสอบไม่สำเร็จ", description: result.message, variant: "destructive" });
    router.refresh();
  }
  return (
    <div className="grid gap-3 border-t p-5">
      {lastStatus === "success" && <Alert variant="success" title="การทดสอบครั้งล่าสุดสำเร็จ" />}
      {lastStatus === "failed" && <Alert variant="destructive" title="การทดสอบครั้งล่าสุดไม่สำเร็จ">{lastError ?? "ตรวจสอบค่าการเชื่อมต่อ"}</Alert>}
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1"><Field label="ส่งอีเมลทดสอบไปที่"><Input name="recipient" type="email" required placeholder="admin@example.com" /></Field></div>
        <Button type="submit" variant="outline" loading={busy}><Send className="h-4 w-4" /> ทดสอบส่ง</Button>
      </form>
    </div>
  );
}

export function CourseAdminControls({ courseId, title, visibility, verified, instructorId, instructors }: {
  courseId: string;
  title: string;
  visibility: string;
  verified: boolean;
  instructorId?: string;
  instructors?: InstructorOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [reassign, setReassign] = useState(false);
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
          { label: "แก้ไขรายวิชา", icon: <Pencil className="h-4 w-4" />, onSelect: () => router.push(`/instructor/courses/${courseId}`) },
          ...(instructorId && instructors ? [{ label: "เปลี่ยนผู้สอน", icon: <UserCog className="h-4 w-4" />, onSelect: () => setReassign(true) }] : []),
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
      {instructorId && instructors && (
        <ReassignInstructorDialog courseId={courseId} title={title} currentId={instructorId} instructors={instructors} open={reassign} onOpenChange={setReassign} />
      )}
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

export function RetryEmailButton({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant="ghost" loading={busy} onClick={async () => {
    setBusy(true);
    const result = await api(`/api/admin/email/${id}/retry`, { method: "POST" });
    setBusy(false);
    if (result.ok) { toast({ title: "นำอีเมลกลับเข้าคิวแล้ว", variant: "success" }); router.refresh(); }
    else toast({ title: "นำกลับเข้าคิวไม่สำเร็จ", description: result.message, variant: "destructive" });
  }}><RotateCcw className="h-4 w-4" /> ส่งใหม่</Button>;
}

export function RemoveSuppressionButton({ email }: { email: string }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant="ghost" loading={busy} onClick={async () => {
    setBusy(true);
    const result = await api("/api/admin/email/suppressions", { method: "DELETE", body: { email } });
    setBusy(false);
    if (result.ok) { toast({ title: "ยกเลิกการระงับอีเมลแล้ว", variant: "success" }); router.refresh(); }
    else toast({ title: "ทำรายการไม่สำเร็จ", description: result.message, variant: "destructive" });
  }}><RotateCcw className="h-4 w-4" /> ยกเลิกการระงับ</Button>;
}

export type CourseDefaultsData = {
  min_watch_percentage: number;
  passing_quiz_score: number;
  max_quiz_attempts_per_day: number;
  quiz_time_limit_min: number;
  is_sequential_locked: boolean;
  navigation_mode: string;
  completion_rule: string;
};

export function CourseDefaultsForm({ defaults }: { defaults: CourseDefaultsData }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    const result = await api("/api/admin/settings/course-defaults", {
      method: "PATCH",
      body: {
        min_watch_percentage: Number(f.get("min_watch_percentage")),
        passing_quiz_score: Number(f.get("passing_quiz_score")),
        max_quiz_attempts_per_day: Number(f.get("max_quiz_attempts_per_day")),
        quiz_time_limit_min: Number(f.get("quiz_time_limit_min")),
        is_sequential_locked: f.get("is_sequential_locked") === "on",
        navigation_mode: f.get("navigation_mode"),
        completion_rule: f.get("completion_rule"),
      },
    });
    setBusy(false);
    if (result.ok) { toast({ title: "บันทึกค่าเริ่มต้นแล้ว", variant: "success" }); router.refresh(); }
    else setError(result.message);
  }
  return (
    <form onSubmit={submit} className="grid gap-4 p-5">
      {error && <Alert variant="destructive" title={error} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="เปอร์เซ็นต์ชมขั้นต่ำ (%)" hint="50–100">
          <Input type="number" name="min_watch_percentage" min={50} max={100} defaultValue={defaults.min_watch_percentage} required />
        </Field>
        <Field label="คะแนนผ่านควิซขั้นต่ำ (%)" hint="0–100">
          <Input type="number" name="passing_quiz_score" min={0} max={100} defaultValue={defaults.passing_quiz_score} required />
        </Field>
        <Field label="จำนวนครั้งทำควิซต่อวัน" hint="1–20">
          <Input type="number" name="max_quiz_attempts_per_day" min={1} max={20} defaultValue={defaults.max_quiz_attempts_per_day} required />
        </Field>
        <Field label="เวลาทำควิซ (นาที)" hint="1–240">
          <Input type="number" name="quiz_time_limit_min" min={1} max={240} defaultValue={defaults.quiz_time_limit_min} required />
        </Field>
        <Field label="โหมดนำทาง">
          <Select name="navigation_mode" defaultValue={defaults.navigation_mode}>
            <option value="free_complete">ดูได้อิสระ นับเฉพาะที่ผ่านเกณฑ์</option>
            <option value="linear">ต้องเรียนตามลำดับ</option>
          </Select>
        </Field>
        <Field label="เงื่อนไขจบหลักสูตร">
          <Select name="completion_rule" defaultValue={defaults.completion_rule}>
            <option value="post_test">ต้องทำแบบทดสอบท้ายหลักสูตร</option>
            <option value="lesson_tests_average">เฉลี่ยคะแนนแบบทดสอบในบท</option>
          </Select>
        </Field>
      </div>
      <div className="flex items-center justify-between">
        <Checkbox name="is_sequential_locked" defaultChecked={defaults.is_sequential_locked} label="ล็อกบทเรียนตามลำดับโดยค่าเริ่มต้น" />
        <Button type="submit" loading={busy}><Save className="h-4 w-4" /> บันทึก</Button>
      </div>
    </form>
  );
}

export function CertificateDisplayForm({ defaults }: { defaults: { show_signer: boolean; issuer_name: string } }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    const result = await api("/api/admin/settings/certificate-display", {
      method: "PATCH",
      body: { show_signer: f.get("show_signer") === "on", issuer_name: String(f.get("issuer_name") ?? "") },
    });
    setBusy(false);
    if (result.ok) { toast({ title: "บันทึกรูปแบบวุฒิบัตรแล้ว", description: "มีผลกับเอกสารที่ออกหลังจากนี้", variant: "success" }); router.refresh(); }
    else setError(result.message);
  }
  return (
    <form onSubmit={submit} className="grid gap-4 p-5">
      {error && <Alert variant="destructive" title={error} />}
      <Field label="ชื่อหน่วยงานผู้ออกเอกสาร" hint="พิมพ์เหนือชื่อเอกสาร เว้นว่างเพื่อใช้ชื่อระบบ">
        <Input name="issuer_name" maxLength={160} defaultValue={defaults.issuer_name} placeholder="เช่น ชื่อสถาบันหรือหน่วยงาน" />
      </Field>
      <Checkbox
        name="show_signer"
        defaultChecked={defaults.show_signer}
        label="แสดงชื่อและตำแหน่งผู้ลงนามบนเอกสาร"
      />
      <p className="-mt-2 text-xs text-muted-foreground">
        เมื่อปิด เอกสารจะไม่มีช่องลงนามของบุคคล และแสดงว่ารับรองด้วยลายมือชื่อดิจิทัลของระบบแทน (ใช้กับเอกสารที่ออกหลังบันทึก ฉบับที่ออกไปแล้วไม่เปลี่ยน)
      </p>
      <Button type="submit" loading={busy} className="justify-self-end"><Save className="h-4 w-4" /> บันทึก</Button>
    </form>
  );
}

type AutomationName = "assignment_reminders" | "cohort_notifications" | "waitlist_promotion";

const AUTOMATION_LABELS: Record<AutomationName, { title: string; description: string }> = {
  assignment_reminders: { title: "เตือนกำหนดส่งงาน", description: "แจ้งผู้เรียนอัตโนมัติเมื่องานครบกำหนดภายใน 24 ชั่วโมง" },
  cohort_notifications: { title: "แจ้งเตือนรอบอบรม", description: "แจ้งผู้ที่อนุมัติแล้วก่อนรอบเริ่ม และแจ้งผู้ติดตามเมื่อเปิดรับสมัคร" },
  waitlist_promotion: { title: "เลื่อนรายชื่อสำรองอัตโนมัติ", description: "เมื่อมีที่นั่งว่าง ระบบเลื่อนผู้รอคิวโดยอัตโนมัติโดยไม่ต้องผู้ดูแลดำเนินการ" },
};

export function AutomationPanel({
  paused,
  backlog,
}: {
  paused: AutomationName[];
  backlog: { email_pending: number; waitlist_pending: number; pdf_failed: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [localPaused, setLocalPaused] = useState<AutomationName[]>(paused);
  const [busy, setBusy] = useState<AutomationName | null>(null);

  async function toggle(name: AutomationName) {
    const willPause = !localPaused.includes(name);
    setBusy(name);
    const r = await api<{ paused: AutomationName[] }>("/api/admin/settings/automations", { method: "PATCH", body: { name, paused: willPause } });
    setBusy(null);
    if (r.ok) {
      setLocalPaused(r.data.paused);
      toast({ title: willPause ? `พักงาน "${AUTOMATION_LABELS[name].title}" แล้ว` : `เปิดงาน "${AUTOMATION_LABELS[name].title}" แล้ว`, variant: "success" });
      router.refresh();
    } else toast({ title: "เปลี่ยนสถานะไม่สำเร็จ", description: r.message, variant: "destructive" });
  }

  const names: AutomationName[] = ["assignment_reminders", "cohort_notifications", "waitlist_promotion"];
  return (
    <div className="divide-y">
      <div className="grid grid-cols-3 gap-4 px-5 py-4 text-sm">
        <div className="text-center">
          <div className="text-2xl font-semibold tabular-nums">{backlog.email_pending}</div>
          <div className="text-xs text-muted-foreground">อีเมลรอส่ง</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold tabular-nums">{backlog.waitlist_pending}</div>
          <div className="text-xs text-muted-foreground">ผู้รอรายชื่อสำรอง</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-semibold tabular-nums ${backlog.pdf_failed > 0 ? "text-destructive" : ""}`}>{backlog.pdf_failed}</div>
          <div className="text-xs text-muted-foreground">PDF ล้มเหลว</div>
        </div>
      </div>
      {names.map((name) => {
        const isPaused = localPaused.includes(name);
        const info = AUTOMATION_LABELS[name];
        return (
          <div key={name} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{info.title}</span>
                <Badge variant={isPaused ? "warning" : "success"}>{isPaused ? "พัก" : "เปิด"}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{info.description}</p>
            </div>
            <Button
              variant={isPaused ? "default" : "outline"}
              size="sm"
              loading={busy === name}
              onClick={() => void toggle(name)}
            >
              {isPaused ? <><Play className="h-3.5 w-3.5" /> เปิดใหม่</> : <><Pause className="h-3.5 w-3.5" /> พัก</>}
            </Button>
          </div>
        );
      })}
      <p className="px-5 py-3 text-xs text-muted-foreground">การพักงานไม่ยกเลิกสิ่งที่ส่งไปแล้ว • การเปิดใหม่ไม่ส่งย้อนหลังอัตโนมัติ</p>
    </div>
  );
}
