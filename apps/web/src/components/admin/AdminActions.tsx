"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Ban, BadgeCheck, ExternalLink, MoreHorizontal, Pencil, RotateCcw, Save, Send, UserCog } from "lucide-react";
import { api } from "@/lib/api";
import { ReassignInstructorDialog, type InstructorOption } from "./CourseOwnerActions";
import { Alert, AlertDialog, Button, Checkbox, DropdownMenu, Field, Input, PasswordInput, Select, Textarea, useToast } from "@/components/ui";

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
