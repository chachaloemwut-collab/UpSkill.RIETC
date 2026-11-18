"use client";
/**
 * Course application form for owners: configure the form (ใบสมัคร), review received applications and keep the
 * staff section (evidence check, registration, payment, receipt). Personal data: shown to course managers only.
 */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, ChevronDown, Download, FileText, Paperclip, Plus, Trash2, X } from "lucide-react";
import {
  APPLICATION_STATUS_LABEL,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABEL,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABEL,
  parseApplicationSettings,
  type ApplicationDocument,
  type ApplicationStatus,
  type FieldMode,
} from "@upskill/core/application";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Select, Textarea, useToast } from "@/components/ui";

export interface EditorApplication {
  id: string;
  application_no: string;
  status: string;
  verification_status: string;
  payment_status: string;
  receipt_no: string | null;
  staff_note: string | null;
  created_at: string;
  applicant: unknown;
  education: unknown;
  occupation: unknown;
  guardian: unknown;
  documents: unknown;
  declaration_name: string;
  files?: Array<{ id: string; doc_key: string; original_name: string; size_bytes: number }>;
}

const STANDARD_DOCUMENTS: ApplicationDocument[] = [
  { key: "id_card", label: "สำเนาบัตรประจำตัวประชาชน", required: true },
  { key: "house_reg", label: "สำเนาทะเบียนบ้าน", required: false },
  { key: "photo", label: "รูปถ่ายหน้าตรง ขนาด 1 นิ้ว", required: false },
  { key: "education_cert", label: "หลักฐานวุฒิการศึกษา", required: false },
];
const MODE_LABEL: Record<FieldMode, string> = { off: "ไม่ใช้", optional: "ไม่บังคับ", required: "บังคับกรอก" };

function useRun() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run(path: string, init: { method?: string; body?: unknown }, success: string) {
    setBusy(true);
    const r = await api(path, init);
    setBusy(false);
    if (r.ok) {
      toast({ title: success, variant: "success" });
      router.refresh();
      return true;
    }
    toast({ title: "ทำรายการไม่สำเร็จ", description: r.message, variant: "destructive" });
    return false;
  }
  return { run, busy };
}

export function ApplicationsManager({ base, rawSettings, applications }: { base: string; rawSettings: unknown; applications: EditorApplication[] }) {
  return (
    <div className="grid gap-5">
      <ApplicationSettingsCard base={base} rawSettings={rawSettings} />
      <ApplicationsList base={base} applications={applications} />
    </div>
  );
}

function ApplicationSettingsCard({ base, rawSettings }: { base: string; rawSettings: unknown }) {
  const a = useRun();
  const initial = parseApplicationSettings(rawSettings);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [docs, setDocs] = useState<ApplicationDocument[]>(initial.documents);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await a.run(
      base,
      {
        method: "PATCH",
        body: {
          application_settings: {
            enabled,
            courseCode: f.get("courseCode"),
            intake: f.get("intake"),
            schedule: f.get("schedule"),
            venue: f.get("venue"),
            education: f.get("education"),
            occupation: f.get("occupation"),
            documents: docs.filter((d) => d.label.trim()),
            documentUploads: f.get("documentUploads"),
            requireApproval: f.get("requireApproval") === "on",
            fee: Number(f.get("fee") || 0),
          },
        },
      },
      "บันทึกการตั้งค่าใบสมัครแล้ว",
    );
  }

  const nextKey = () => {
    let i = docs.length + 1;
    while (docs.some((d) => d.key === `doc_${i}`)) i++;
    return `doc_${i}`;
  };

  return (
    <Card className="p-5 shadow-sm">
      <form onSubmit={onSubmit} className="grid gap-5">
        <div className="border-b pb-3">
          <h3 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" /> แบบฟอร์มใบสมัคร</h3>
          <p className="text-xs text-muted-foreground">เปิดใช้แล้ว ผู้เรียนต้องกรอกใบสมัครทุกครั้งก่อนลงทะเบียนหลักสูตรนี้ ข้อมูลเก็บเป็นฐานข้อมูลผู้สมัครรายหลักสูตร</p>
        </div>
        <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} label="เปิดใช้ใบสมัครสำหรับหลักสูตรนี้" />

        <fieldset className={cn("grid gap-5", !enabled && "pointer-events-none opacity-50")} disabled={!enabled}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="รหัสหลักสูตร" hint="ไม่บังคับ"><Input name="courseCode" maxLength={60} defaultValue={initial.courseCode} /></Field>
            <Field label="รุ่นที่เปิดรับ" hint="เช่น รุ่นที่ 1 ประชาชนทั่วไป"><Input name="intake" maxLength={120} defaultValue={initial.intake} /></Field>
            <Field label="วันและเวลาเรียน" hint="เช่น เรียนออนไลน์ได้ตลอด 24 ชั่วโมง ถึง 22 พ.ย. 2569"><Input name="schedule" maxLength={300} defaultValue={initial.schedule} /></Field>
            <Field label="สถานที่เรียน" hint="เช่น ออนไลน์ผ่านระบบ UpSkill"><Input name="venue" maxLength={300} defaultValue={initial.venue} /></Field>
            <Field label="ข้อมูลการศึกษา">
              <Select name="education" defaultValue={initial.education}>
                {(["off", "optional", "required"] as const).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </Select>
            </Field>
            <Field label="ข้อมูลอาชีพ">
              <Select name="occupation" defaultValue={initial.occupation}>
                {(["off", "optional", "required"] as const).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </Select>
            </Field>
            <Field label="การแนบไฟล์เอกสาร" hint="PDF, JPG หรือ PNG ไม่เกิน 5 MB ต่อไฟล์">
              <Select name="documentUploads" defaultValue={initial.documentUploads}>
                <option value="off">ไม่ต้องแนบไฟล์ (ติ๊กรายการเท่านั้น)</option>
                <option value="optional">แนบไฟล์ได้ (ไม่บังคับ)</option>
                <option value="required">ต้องแนบไฟล์ทุกเอกสารที่ยื่น</option>
              </Select>
            </Field>
            <Field label="ค่าลงทะเบียน (บาท)" hint="0 = ไม่มีค่าใช้จ่าย"><Input name="fee" type="number" min={0} max={1000000} defaultValue={initial.fee} /></Field>
          </div>
          <Checkbox name="requireApproval" defaultChecked={initial.requireApproval} label="เจ้าหน้าที่ต้องอนุมัติใบสมัครก่อน ผู้สมัครจึงเริ่มเรียนได้ (ไม่เลือก = ลงทะเบียนทันทีเมื่อส่งใบสมัคร)" />

          <div className="grid gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">เอกสารประกอบการสมัคร</p>
                <p className="text-xs text-muted-foreground">ผู้สมัครทำเครื่องหมายเอกสารที่จะยื่น เจ้าหน้าที่บันทึกผลตรวจในรายการใบสมัคร</p>
              </div>
              <div className="flex gap-2">
                {docs.length === 0 && <Button type="button" size="sm" variant="outline" onClick={() => setDocs(STANDARD_DOCUMENTS)}>ใช้รายการมาตรฐาน</Button>}
                <Button type="button" size="sm" variant="outline" onClick={() => setDocs((d) => [...d, { key: nextKey(), label: "", required: false }])}><Plus className="h-4 w-4" /> เพิ่มเอกสาร</Button>
              </div>
            </div>
            {docs.map((d, i) => (
              <div key={d.key} className="flex flex-wrap items-center gap-2">
                <Input className="min-w-0 flex-1" maxLength={120} value={d.label} placeholder="ชื่อเอกสาร" onChange={(e) => setDocs((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Checkbox checked={d.required} onChange={(e) => setDocs((all) => all.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} label="จำเป็น" />
                <Button type="button" variant="ghost" size="icon" aria-label="ลบเอกสาร" onClick={() => setDocs((all) => all.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </fieldset>
        <Button type="submit" loading={a.busy} className="justify-self-start">บันทึกการตั้งค่าใบสมัคร</Button>
      </form>
    </Card>
  );
}

const statusVariant = (s: string) => (s === "approved" ? "success" : s === "rejected" ? "destructive" : "warning") as "success" | "destructive" | "warning";

function ApplicationsList({ base, applications }: { base: string; applications: EditorApplication[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | ApplicationStatus>("all");
  const shown = filter === "all" ? applications : applications.filter((a) => a.status === filter);
  const count = (s: ApplicationStatus) => applications.filter((a) => a.status === s).length;
  return (
    <Card className="shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5">
        <div>
          <h3 className="font-semibold">ใบสมัครที่ได้รับ ({applications.length})</h3>
          <p className="text-xs text-muted-foreground">รอพิจารณา {count("submitted")} · ลงทะเบียนแล้ว {count("approved")} · ไม่ผ่าน {count("rejected")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)} aria-label="กรองสถานะ">
              <option value="all">ทุกสถานะ</option>
              <option value="submitted">รอพิจารณา</option>
              <option value="approved">ลงทะเบียนแล้ว</option>
              <option value="rejected">ไม่ผ่าน</option>
            </Select>
          </div>
          {applications.length > 0 && (
            <a href={`${base}/applications/export`} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted">
              <Download className="h-4 w-4" /> ส่งออก CSV
            </a>
          )}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="p-6"><EmptyState icon={<FileText className="h-6 w-6 text-primary" />} title="ยังไม่มีใบสมัคร" description="เมื่อผู้เรียนส่งใบสมัคร รายการจะแสดงที่นี่" /></div>
      ) : (
        <ul className="divide-y">
          {shown.map((app) => {
            const a = (app.applicant ?? {}) as Record<string, string>;
            const isOpen = open === app.id;
            return (
              <li key={app.id}>
                <button type="button" onClick={() => setOpen(isOpen ? null : app.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/30" aria-expanded={isOpen}>
                  <span className="font-mono text-xs text-muted-foreground">{app.application_no}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{`${a.titleTh ?? ""}${a.firstNameTh ?? ""} ${a.lastNameTh ?? ""}`.trim() || app.declaration_name}</span>
                  <Badge variant={statusVariant(app.status)} className="text-[11px]">{APPLICATION_STATUS_LABEL[app.status as ApplicationStatus] ?? app.status}</Badge>
                  <Badge variant="outline" className="text-[11px]">{VERIFICATION_STATUS_LABEL[app.verification_status as keyof typeof VERIFICATION_STATUS_LABEL] ?? app.verification_status}</Badge>
                  <Badge variant="outline" className="text-[11px]">{PAYMENT_STATUS_LABEL[app.payment_status as keyof typeof PAYMENT_STATUS_LABEL] ?? app.payment_status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(app.created_at).toLocaleDateString("th-TH", { dateStyle: "medium" })}</span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && <ApplicationDetail base={base} app={app} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ApplicationDetail({ base, app }: { base: string; app: EditorApplication }) {
  const r = useRun();
  const a = (app.applicant ?? {}) as Record<string, string>;
  const ed = app.education as Record<string, string> | null;
  const oc = app.occupation as Record<string, string> | null;
  const g = app.guardian as Record<string, string> | null;
  const docs = (app.documents ?? {}) as Record<string, { label: string; declared: boolean; verified: boolean | null }>;
  const [docVerify, setDocVerify] = useState<Record<string, boolean | null>>(Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, d.verified ?? null])));
  const url = `${base}/applications/${app.id}`;
  // base = /api/instructor/courses/<id> → files are served by /api/courses/<id>/application/files/<fileId>
  const fileBase = `${base.replace("/api/instructor/courses/", "/api/courses/")}/application/files`;
  const fileFor = (docKey: string) => app.files?.find((f) => f.doc_key === docKey);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await r.run(
      url,
      {
        method: "PATCH",
        body: {
          verification_status: f.get("verification_status"),
          payment_status: f.get("payment_status"),
          receipt_no: String(f.get("receipt_no") ?? "") || null,
          staff_note: String(f.get("staff_note") ?? "") || null,
          documents_verified: docVerify,
        },
      },
      "บันทึกส่วนเจ้าหน้าที่แล้ว",
    );
  }

  const line = (label: string, value: string | undefined | null) => (
    <div className="grid grid-cols-[8rem_1fr] gap-2 text-sm"><span className="text-muted-foreground">{label}</span><span>{value || "-"}</span></div>
  );
  return (
    <div className="grid gap-4 bg-muted/20 px-4 py-4 lg:grid-cols-2">
      <div className="grid content-start gap-1.5">
        {line("Name", [a.titleEn, a.firstNameEn, a.lastNameEn].filter(Boolean).join(" "))}
        {line("วันเกิด", a.birthDate)}
        {line("เลขบัตร (4 หลักท้าย)", a.nationalIdLast4)}
        {line("โทรศัพท์", a.phone)}
        {line("อีเมล", a.email)}
        {line("ที่อยู่", [a.addressLine, a.subdistrict, a.district, a.province, a.postalCode].filter(Boolean).join(" "))}
        {ed && line("การศึกษา", [ed.level, ed.qualification, ed.institution].filter(Boolean).join(" · "))}
        {oc && line("อาชีพ", [oc.occupation, oc.organization].filter(Boolean).join(" · "))}
        {g && line("ผู้ปกครอง", `${g.name} (${g.relation}) ${g.phone}`)}
        {line("ลงชื่อผู้สมัคร", app.declaration_name)}
      </div>
      <form onSubmit={save} className="grid content-start gap-3">
        {Object.keys(docs).length > 0 && (
          <div className="grid gap-1.5 rounded-md border bg-background p-3">
            <p className="text-xs font-semibold">ผลตรวจเอกสาร</p>
            {Object.entries(docs).map(([k, d]) => (
              <div key={k} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="grid">
                  <span>{d.declared ? "☑" : "☐"} {d.label}</span>
                  {fileFor(k) && (
                    <a href={`${fileBase}/${fileFor(k)!.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <Paperclip className="h-3 w-3" /> {fileFor(k)!.original_name}
                    </a>
                  )}
                </span>
                <div className="flex gap-1">
                  {([true, false, null] as const).map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setDocVerify((x) => ({ ...x, [k]: v }))}
                      className={cn("inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs", docVerify[k] === v ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}
                    >
                      {v === true ? <><Check className="h-3 w-3" /> ผ่าน</> : v === false ? <><X className="h-3 w-3" /> ไม่ผ่าน</> : "ยังไม่ตรวจ"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ผลตรวจสอบหลักฐาน">
            <Select name="verification_status" defaultValue={app.verification_status}>
              {VERIFICATION_STATUSES.map((s) => <option key={s} value={s}>{VERIFICATION_STATUS_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field label="การชำระเงิน">
            <Select name="payment_status" defaultValue={app.payment_status}>
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field label="เลขที่ใบเสร็จ"><Input name="receipt_no" maxLength={64} defaultValue={app.receipt_no ?? ""} /></Field>
        </div>
        <Field label="หมายเหตุเจ้าหน้าที่"><Textarea name="staff_note" rows={2} maxLength={2000} defaultValue={app.staff_note ?? ""} /></Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" loading={r.busy}>บันทึก</Button>
          {app.status !== "approved" && (
            <Button type="button" size="sm" variant="outline" disabled={r.busy} onClick={() => void r.run(url, { method: "PATCH", body: { action: "approve" } }, "อนุมัติและลงทะเบียนแล้ว")}>
              <Check className="h-4 w-4" /> อนุมัติและลงทะเบียน
            </Button>
          )}
          {app.status === "submitted" && (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={r.busy} onClick={() => void r.run(url, { method: "PATCH", body: { action: "reject" } }, "บันทึกว่าไม่ผ่านการพิจารณาแล้ว")}>
              <X className="h-4 w-4" /> ไม่ผ่าน
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
