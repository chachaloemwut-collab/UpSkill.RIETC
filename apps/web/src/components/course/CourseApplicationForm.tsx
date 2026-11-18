"use client";
/**
 * ใบสมัครเรียนรายวิชา — filled once per course enrollment. Identity comes from the profile (read-only here),
 * contact details are pre-filled and editable for this application, and the same core rules as the server
 * validate every field before sending.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardList, FileUp, Paperclip, Printer, X } from "lucide-react";
import {
  APPLICATION_FILE_MAX_BYTES,
  EDUCATION_LEVELS,
  GUARDIAN_RELATIONS,
  OCCUPATIONS,
  validateApplication,
  type ApplicationErrors,
  type ApplicationInput,
  type ApplicationSettings,
} from "@upskill/core/application";
import { THAI_PROVINCES } from "@upskill/core/profile";
import { api } from "@/lib/api";
import { Alert, Button, Card, Checkbox, Field, Input, Select, buttonClass } from "@/components/ui";
import { PdpaNotice } from "@/components/account/ProfileFields";

export interface ApplyProfile {
  email: string;
  title_th: string;
  first_name_th: string;
  last_name_th: string;
  title_en: string;
  first_name_en: string;
  last_name_en: string;
  birth_date: string | null;
  national_id_last4: string;
  phone: string;
  address_line: string;
  subdistrict: string;
  district: string;
  province: string;
  postal_code: string;
  guardian_name: string | null;
  guardian_phone: string | null;
}

const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "UTC" }) : "-";

function Section({ n, title, children, hint }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="grid gap-4 p-5 break-inside-avoid">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{n}</span>
          {title}
        </h2>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "-"}</span>
    </div>
  );
}

export function CourseInfoRows({ title, settings }: { title: string; settings: Pick<ApplicationSettings, "courseCode" | "intake" | "schedule" | "venue" | "fee"> }) {
  return (
    <div className="grid gap-2">
      <Row label="ชื่อหลักสูตร" value={title} />
      {settings.courseCode && <Row label="รหัสหลักสูตร" value={settings.courseCode} />}
      {settings.intake && <Row label="รุ่นที่สมัคร" value={settings.intake} />}
      {settings.schedule && <Row label="วันและเวลาเรียน" value={settings.schedule} />}
      {settings.venue && <Row label="สถานที่เรียน" value={settings.venue} />}
      <Row label="ค่าลงทะเบียน" value={settings.fee > 0 ? `${settings.fee.toLocaleString("th-TH")} บาท` : "ไม่มีค่าใช้จ่าย"} />
    </div>
  );
}

export interface ApplicationFile {
  id: string;
  doc_key: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
}

const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

export function CourseApplicationForm({
  courseId, courseSlug, courseTitle, settings, profile, minor, pendingFiles = [],
}: {
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  settings: ApplicationSettings;
  profile: ApplyProfile;
  minor: boolean;
  pendingFiles?: ApplicationFile[];
}) {
  const router = useRouter();
  const [contact, setContact] = useState<ApplicationInput["contact"]>({
    phone: profile.phone, email: profile.email, addressLine: profile.address_line, subdistrict: profile.subdistrict,
    district: profile.district, province: profile.province, postalCode: profile.postal_code,
  });
  const [education, setEducation] = useState({ level: "", institution: "", qualification: "" });
  const [occupation, setOccupation] = useState({ occupation: "", organization: "" });
  const [guardian, setGuardian] = useState({ name: profile.guardian_name ?? "", relation: "", phone: profile.guardian_phone ?? "", consent: false });
  const [documents, setDocuments] = useState<Record<string, boolean>>(Object.fromEntries(pendingFiles.map((f) => [f.doc_key, true])));
  // newest file per document (the server keeps one per document)
  const [files, setFiles] = useState<Record<string, ApplicationFile>>(() => {
    const m: Record<string, ApplicationFile> = {};
    for (const f of pendingFiles) m[f.doc_key] ??= f;
    return m;
  });
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const uploads = settings.documentUploads !== "off";

  async function upload(docKey: string, file: File) {
    setUploadError((x) => ({ ...x, [docKey]: "" }));
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name) && !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setUploadError((x) => ({ ...x, [docKey]: "รองรับเฉพาะไฟล์ PDF, JPG หรือ PNG" }));
      return;
    }
    if (file.size > APPLICATION_FILE_MAX_BYTES) {
      setUploadError((x) => ({ ...x, [docKey]: `ไฟล์ใหญ่เกิน 5 MB (${fileSize(file.size)})` }));
      return;
    }
    setUploading(docKey);
    try {
      const res = await fetch(`/api/courses/${courseId}/application/files?doc=${encodeURIComponent(docKey)}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name) },
        body: file,
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as ApplicationFile & { message?: string; error?: string };
      if (!res.ok) throw new Error(data.message ?? (res.status === 413 ? "ไฟล์ใหญ่เกิน 5 MB" : "อัปโหลดไม่สำเร็จ"));
      setFiles((x) => ({ ...x, [docKey]: data }));
      setDocuments((x) => ({ ...x, [docKey]: true }));
    } catch (e) {
      setUploadError((x) => ({ ...x, [docKey]: e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" }));
    } finally {
      setUploading(null);
    }
  }

  async function removeFile(docKey: string) {
    const f = files[docKey];
    if (!f) return;
    const r = await api(`/api/courses/${courseId}/application/files/${f.id}`, { method: "DELETE" });
    if (r.ok) setFiles((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== docKey)));
    else setUploadError((x) => ({ ...x, [docKey]: r.message }));
  }
  const [signatureName, setSignatureName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ applicationNo: string; status: "approved" | "submitted" } | null>(null);
  const expected = `${profile.first_name_th} ${profile.last_name_th}`;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input: ApplicationInput = {
      contact,
      education: settings.education === "off" ? null : education,
      occupation: settings.occupation === "off" ? null : occupation,
      guardian: minor ? guardian : null,
      documents,
      declaration: { signatureName, accepted },
      pdpaConsent: new FormData(form).get("pdpaConsent") === "on",
    };
    const checked = validateApplication(settings, input, {
      minor,
      expectedSignature: expected,
      expectedSignatureWithTitle: `${profile.title_th}${expected}`,
      uploadedDocKeys: Object.keys(files),
    });
    setErrors(checked.errors);
    if (!checked.value) {
      setError("กรุณาแก้ไขช่องที่มีข้อความสีแดง");
      requestAnimationFrame(() => form.querySelector(".text-destructive")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    setBusy(true);
    setError(null);
    const r = await api<{ applicationNo: string; status: "approved" | "submitted" }>(`/api/courses/${courseId}/application`, { body: input });
    setBusy(false);
    if (r.ok) {
      setDone(r.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    } else {
      setError(r.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (done)
    return (
      <Card className="grid justify-items-center gap-4 p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-success" />
        <div>
          <p className="text-lg font-semibold">ส่งใบสมัครเรียบร้อย</p>
          <p className="mt-1 text-sm text-muted-foreground">
            เลขที่ใบสมัคร <strong className="font-mono text-foreground">{done.applicationNo}</strong>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {done.status === "approved" ? "ลงทะเบียนเรียนเรียบร้อยแล้ว เริ่มเรียนได้ทันที" : "เจ้าหน้าที่จะตรวจสอบใบสมัคร และแจ้งผลทางอีเมล"}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/courses/${courseSlug}`} className={buttonClass("default", "lg")}>
            {done.status === "approved" ? "เริ่มเรียน" : "กลับไปหน้าหลักสูตร"}
          </Link>
          <Link href={`/courses/${courseSlug}/apply`} className={buttonClass("outline", "lg")}>
            <ClipboardList className="h-4 w-4" /> ดู/พิมพ์ใบสมัคร
          </Link>
        </div>
      </Card>
    );

  const c = (k: keyof ApplicationInput["contact"]) => ({
    value: contact[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setContact((x) => ({ ...x, [k]: e.target.value })),
  });
  const err = (k: string) => errors[k];
  let n = 0;

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {error && <Alert variant="destructive" title={error} />}

      <Section n={++n} title="ข้อมูลหลักสูตร">
        <CourseInfoRows title={courseTitle} settings={settings} />
      </Section>

      <Section n={++n} title="ข้อมูลผู้สมัคร" hint="ดึงจากข้อมูลบัญชีของคุณ หากไม่ถูกต้องให้แก้ไขที่หน้าข้อมูลส่วนตัวก่อน">
        <div className="grid gap-2">
          <Row label="ชื่อ-นามสกุล" value={`${profile.title_th}${profile.first_name_th} ${profile.last_name_th}`} />
          <Row label="Name" value={`${profile.title_en} ${profile.first_name_en} ${profile.last_name_en}`} />
          <Row label="วันเดือนปีเกิด" value={thaiDate(profile.birth_date)} />
          <Row label="เลขประจำตัวประชาชน" value={<span className="font-mono">x-xxxx-xxxxx-{profile.national_id_last4.slice(0, 2)}-{profile.national_id_last4.slice(2)}</span>} />
        </div>
        <Link href="/me/profile" className="w-fit text-sm font-medium text-primary hover:underline">แก้ไขข้อมูลส่วนตัว</Link>
      </Section>

      <Section n={++n} title="ข้อมูลติดต่อ" hint="ใช้สำหรับการอบรมครั้งนี้ แก้ไขได้หากต่างจากข้อมูลบัญชี">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="เบอร์โทรศัพท์มือถือ" error={err("contact.phone")}><Input type="tel" inputMode="tel" maxLength={20} {...c("phone")} /></Field>
          <Field label="อีเมล" error={err("contact.email")}><Input type="email" maxLength={254} {...c("email")} /></Field>
        </div>
        <Field label="ที่อยู่ปัจจุบัน (บ้านเลขที่ หมู่ ซอย ถนน)" error={err("contact.addressLine")}><Input maxLength={255} {...c("addressLine")} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ตำบล/แขวง" error={err("contact.subdistrict")}><Input maxLength={100} {...c("subdistrict")} /></Field>
          <Field label="อำเภอ/เขต" error={err("contact.district")}><Input maxLength={100} {...c("district")} /></Field>
          <Field label="จังหวัด" error={err("contact.province")}>
            <Select value={contact.province} onValueChange={(v) => setContact((x) => ({ ...x, province: v }))} options={THAI_PROVINCES.map((p) => ({ value: p, label: p }))} placeholder="เลือกจังหวัด…" />
          </Field>
          <Field label="รหัสไปรษณีย์" error={err("contact.postalCode")}><Input inputMode="numeric" maxLength={5} {...c("postalCode")} /></Field>
        </div>
      </Section>

      {settings.education !== "off" && (
        <Section n={++n} title="ข้อมูลการศึกษา" hint={settings.education === "required" ? "จำเป็นต้องกรอก" : "ไม่บังคับ"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ระดับการศึกษาสูงสุด" error={err("education.level")}>
              <Select value={education.level} onValueChange={(v) => setEducation((x) => ({ ...x, level: v }))} options={EDUCATION_LEVELS.map((v) => ({ value: v, label: v }))} placeholder="เลือก…" />
            </Field>
            <Field label="วุฒิการศึกษา/สาขา" error={err("education.qualification")}>
              <Input maxLength={300} value={education.qualification} onChange={(e) => setEducation((x) => ({ ...x, qualification: e.target.value }))} placeholder="เช่น ปวส. ช่างไฟฟ้า" />
            </Field>
          </div>
          <Field label="สถานศึกษาเดิม" error={err("education.institution")}>
            <Input maxLength={300} value={education.institution} onChange={(e) => setEducation((x) => ({ ...x, institution: e.target.value }))} />
          </Field>
        </Section>
      )}

      {settings.occupation !== "off" && (
        <Section n={++n} title="ข้อมูลอาชีพ" hint={settings.occupation === "required" ? "จำเป็นต้องกรอก" : "ไม่บังคับ"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="อาชีพปัจจุบัน" error={err("occupation.occupation")}>
              <Select value={occupation.occupation} onValueChange={(v) => setOccupation((x) => ({ ...x, occupation: v }))} options={OCCUPATIONS.map((v) => ({ value: v, label: v }))} placeholder="เลือก…" />
            </Field>
            <Field label="หน่วยงาน/สถานประกอบการ">
              <Input maxLength={300} value={occupation.organization} onChange={(e) => setOccupation((x) => ({ ...x, organization: e.target.value }))} />
            </Field>
          </div>
        </Section>
      )}

      {minor && (
        <Section n={++n} title="ข้อมูลผู้ปกครอง" hint="ผู้สมัครอายุต่ำกว่า 20 ปี ต้องได้รับความยินยอมจากผู้ปกครอง">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ชื่อ-นามสกุล" error={err("guardian.name")}><Input maxLength={255} value={guardian.name} onChange={(e) => setGuardian((x) => ({ ...x, name: e.target.value }))} /></Field>
            <Field label="ความสัมพันธ์" error={err("guardian.relation")}>
              <Select value={guardian.relation} onValueChange={(v) => setGuardian((x) => ({ ...x, relation: v }))} options={GUARDIAN_RELATIONS.map((v) => ({ value: v, label: v }))} placeholder="เลือก…" />
            </Field>
            <Field label="เบอร์โทรศัพท์" error={err("guardian.phone")}><Input type="tel" maxLength={20} value={guardian.phone} onChange={(e) => setGuardian((x) => ({ ...x, phone: e.target.value }))} /></Field>
          </div>
          <div>
            <Checkbox checked={guardian.consent} onChange={(e) => setGuardian((x) => ({ ...x, consent: e.target.checked }))} label="ผู้ปกครองรับรองว่าได้รับทราบและยินยอมให้ผู้สมัครเข้ารับการอบรม" />
            {err("guardian.consent") && <p className="mt-1 text-xs text-destructive">{err("guardian.consent")}</p>}
          </div>
        </Section>
      )}

      {settings.documents.length > 0 && (
        <Section
          n={++n}
          title="เอกสารประกอบการสมัคร"
          hint={
            settings.documentUploads === "required"
              ? "แนบไฟล์ทุกเอกสารที่ยื่น (PDF, JPG หรือ PNG ไม่เกิน 5 MB ต่อไฟล์) เจ้าหน้าที่จะตรวจสอบหลักฐาน"
              : uploads
                ? "ทำเครื่องหมายเอกสารที่จะยื่น และแนบไฟล์ได้ (PDF, JPG หรือ PNG ไม่เกิน 5 MB ต่อไฟล์)"
                : "ทำเครื่องหมายเอกสารที่คุณจะยื่นตามประกาศรับสมัคร เจ้าหน้าที่จะตรวจสอบหลักฐานอีกครั้ง"
          }
        >
          <div className="grid gap-3">
            {settings.documents.map((d) => {
              const f = files[d.key];
              return (
                <div key={d.key} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Checkbox
                      checked={documents[d.key] === true || !!f}
                      disabled={!!f}
                      onChange={(e) => setDocuments((x) => ({ ...x, [d.key]: e.target.checked }))}
                      label={`${d.label}${d.required ? " (จำเป็น)" : ""}`}
                    />
                    {uploads && !f && (
                      <label className={buttonClass("outline", "sm", "cursor-pointer gap-1.5")}>
                        <FileUp className="h-4 w-4" /> {uploading === d.key ? "กำลังอัปโหลด…" : "แนบไฟล์"}
                        <input
                          type="file"
                          accept={ACCEPT}
                          className="sr-only"
                          disabled={uploading !== null}
                          onChange={(e) => {
                            const file = e.currentTarget.files?.[0];
                            e.currentTarget.value = "";
                            if (file) void upload(d.key, file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {f && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                      <a href={`/api/courses/${courseId}/application/files/${f.id}`} className="inline-flex min-w-0 items-center gap-1.5 font-medium text-primary hover:underline">
                        <Paperclip className="h-4 w-4 shrink-0" /> <span className="truncate">{f.original_name}</span>
                      </a>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {fileSize(f.size_bytes)}
                        <button type="button" onClick={() => void removeFile(d.key)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-background hover:text-destructive" aria-label={`ลบไฟล์ ${f.original_name}`}>
                          <X className="h-3.5 w-3.5" /> ลบ
                        </button>
                      </span>
                    </div>
                  )}
                  {uploadError[d.key] && <p className="text-xs text-destructive">{uploadError[d.key]}</p>}
                  {err(`documents.${d.key}`) && <p className="text-xs text-destructive">{err(`documents.${d.key}`)}</p>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section n={++n} title="การรับรองข้อมูล">
        <div>
          <Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} label="ข้าพเจ้าขอรับรองว่าข้อความข้างต้นเป็นความจริงทุกประการ หากตรวจพบภายหลังว่าไม่เป็นความจริง ยินยอมให้ยกเลิกการสมัคร" />
          {err("declaration.accepted") && <p className="mt-1 text-xs text-destructive">{err("declaration.accepted")}</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="ลงชื่อผู้สมัคร (พิมพ์ชื่อ-นามสกุล)" error={err("declaration.signatureName")} hint={`พิมพ์ว่า: ${expected}`}>
            <Input maxLength={255} value={signatureName} onChange={(e) => setSignatureName(e.target.value)} autoComplete="off" />
          </Field>
          <p className="pb-2 text-sm text-muted-foreground">วันที่สมัคร {new Date().toLocaleDateString("th-TH", { dateStyle: "long" })}</p>
        </div>
        <PdpaNotice error={err("pdpaConsent")} />
      </Section>

      <Button type="submit" size="lg" loading={busy} className="w-full">
        ส่งใบสมัคร{settings.requireApproval ? "" : "และลงทะเบียนเรียน"}
      </Button>
    </form>
  );
}

/** Read-only (printable) view of a submitted application. */
export function ApplicationSummary({
  application, courseSlug,
}: {
  application: {
    application_no: string; status: string; verification_status: string; payment_status: string; receipt_no: string | null;
    created_at: string | Date; course_snapshot: unknown; applicant: unknown; education: unknown; occupation: unknown; guardian: unknown;
    documents: unknown; declaration_name: string; declared_at: string | Date;
    files?: ApplicationFile[]; courseId?: string;
  };
  courseSlug: string;
}) {
  const snap = (application.course_snapshot ?? {}) as { title?: string; courseCode?: string; intake?: string; schedule?: string; venue?: string; fee?: number };
  const a = (application.applicant ?? {}) as Record<string, string>;
  const ed = application.education as Record<string, string> | null;
  const oc = application.occupation as Record<string, string> | null;
  const g = application.guardian as Record<string, string> | null;
  const docs = Object.values((application.documents ?? {}) as Record<string, { label: string; declared: boolean; verified: boolean | null }>);
  const STATUS: Record<string, string> = { submitted: "รอเจ้าหน้าที่พิจารณา", approved: "ลงทะเบียนแล้ว", rejected: "ไม่ผ่านการพิจารณา" };
  const VERIFY: Record<string, string> = { pending: "รอตรวจหลักฐาน", verified: "หลักฐานครบถ้วน", incomplete: "หลักฐานไม่ครบ" };
  const PAY: Record<string, string> = { not_required: "ไม่มีค่าใช้จ่าย", pending: "รอชำระเงิน", paid: "ชำระแล้ว", waived: "ยกเว้นค่าใช้จ่าย" };
  return (
    <div className="grid gap-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs text-muted-foreground">เลขที่ใบสมัคร</p>
          <p className="font-mono text-lg font-semibold">{application.application_no}</p>
          <p className="mt-1 text-sm">
            สถานะ: <strong>{STATUS[application.status] ?? application.status}</strong> · {VERIFY[application.verification_status] ?? application.verification_status} · {PAY[application.payment_status] ?? application.payment_status}
            {application.receipt_no ? ` · ใบเสร็จเลขที่ ${application.receipt_no}` : ""}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> พิมพ์ใบสมัคร</Button>
          <Link href={`/courses/${courseSlug}`} className={buttonClass("default")}>{application.status === "approved" ? "ไปเรียน" : "กลับหน้าหลักสูตร"}</Link>
        </div>
      </Card>
      <Section n={1} title="ข้อมูลหลักสูตร">
        <CourseInfoRows title={snap.title ?? ""} settings={{ courseCode: snap.courseCode ?? "", intake: snap.intake ?? "", schedule: snap.schedule ?? "", venue: snap.venue ?? "", fee: snap.fee ?? 0 }} />
      </Section>
      <Section n={2} title="ข้อมูลผู้สมัครและการติดต่อ">
        <div className="grid gap-2">
          <Row label="ชื่อ-นามสกุล" value={`${a.titleTh ?? ""}${a.firstNameTh ?? ""} ${a.lastNameTh ?? ""}`} />
          <Row label="Name" value={`${a.titleEn ?? ""} ${a.firstNameEn ?? ""} ${a.lastNameEn ?? ""}`} />
          <Row label="วันเดือนปีเกิด" value={thaiDate(a.birthDate)} />
          <Row label="เลขประจำตัวประชาชน" value={a.nationalIdLast4 ? `xxxxxxxxx${a.nationalIdLast4}` : "-"} />
          <Row label="โทรศัพท์" value={a.phone} />
          <Row label="อีเมล" value={a.email} />
          <Row label="ที่อยู่" value={[a.addressLine, a.subdistrict, a.district, a.province, a.postalCode].filter(Boolean).join(" ")} />
        </div>
      </Section>
      {(ed || oc) && (
        <Section n={3} title="การศึกษาและอาชีพ">
          <div className="grid gap-2">
            {ed && <Row label="การศึกษาสูงสุด" value={[ed.level, ed.qualification, ed.institution].filter(Boolean).join(" · ")} />}
            {oc && <Row label="อาชีพ" value={[oc.occupation, oc.organization].filter(Boolean).join(" · ")} />}
          </div>
        </Section>
      )}
      {g && (
        <Section n={4} title="ผู้ปกครอง">
          <Row label="ชื่อ-นามสกุล" value={`${g.name} (${g.relation}) โทร ${g.phone}`} />
        </Section>
      )}
      {docs.length > 0 && (
        <Section n={5} title="เอกสารประกอบ">
          <ul className="grid gap-1 text-sm">
            {docs.map((d) => (
              <li key={d.label}>
                {d.declared ? "☑" : "☐"} {d.label}
                {d.verified === true ? " — ตรวจแล้ว" : d.verified === false ? " — ไม่ผ่านการตรวจ" : ""}
              </li>
            ))}
          </ul>
          {application.files && application.files.length > 0 && application.courseId && (
            <ul className="grid gap-1 text-sm print:hidden">
              {application.files.map((f) => (
                <li key={f.id}>
                  <a href={`/api/courses/${application.courseId}/application/files/${f.id}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                    <Paperclip className="h-3.5 w-3.5" /> {f.original_name} ({fileSize(f.size_bytes)})
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      <Section n={6} title="การรับรองข้อมูล">
        <Row label="ลงชื่อผู้สมัคร" value={application.declaration_name} />
        <Row label="วันที่สมัคร" value={new Date(application.declared_at).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" })} />
      </Section>
    </div>
  );
}
