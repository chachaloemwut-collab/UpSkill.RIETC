/**
 * Course application form (ใบสมัครเรียนรายวิชาหลักสูตรระยะสั้น) — pure rules, client-safe (no node:* imports).
 *
 * Each course can turn the form on and choose which optional parts it needs. The applicant's identity and
 * contact data come pre-filled from their profile; the form adds education, occupation, guardian (minors),
 * a document checklist and a signed declaration. One application per enrollment, numbered APP-<BE year>-<seq>.
 * This module is the single place that interprets the settings and validates answers (web UI + server agree).
 */
export type FieldMode = "off" | "optional" | "required";

export interface ApplicationDocument {
  key: string;
  label: string;
  required: boolean;
}

export interface ApplicationSettings {
  /** Off = old one-click enrollment */
  enabled: boolean;
  /** หมวด 1: course info printed on the application */
  courseCode: string;
  intake: string;
  schedule: string;
  venue: string;
  /** หมวด 4–5 */
  education: FieldMode;
  occupation: FieldMode;
  /** หมวด 7: documents the applicant declares they will submit (checklist; staff verify) */
  documents: ApplicationDocument[];
  /** Staff must approve before the applicant is enrolled */
  requireApproval: boolean;
  /** Fee in baht (0 = free); staff record payment and receipt numbers */
  fee: number;
}

export const DEFAULT_APPLICATION_SETTINGS: ApplicationSettings = {
  enabled: false,
  courseCode: "",
  intake: "",
  schedule: "",
  venue: "",
  education: "optional",
  occupation: "optional",
  documents: [],
  requireApproval: false,
  fee: 0,
};

export const APPLICATION_LIMITS = { text: 300, longText: 1000, documents: 10, docLabel: 120, signature: 255 } as const;

export const EDUCATION_LEVELS = [
  "ต่ำกว่าประถมศึกษา", "ประถมศึกษา", "มัธยมศึกษาตอนต้น", "มัธยมศึกษาตอนปลาย", "ปวช.", "ปวส.",
  "อนุปริญญา", "ปริญญาตรี", "ปริญญาโท", "ปริญญาเอก", "อื่น ๆ",
] as const;

export const OCCUPATIONS = [
  "นักเรียน/นักศึกษา", "รับราชการ/รัฐวิสาหกิจ", "พนักงานบริษัท", "ธุรกิจส่วนตัว/ค้าขาย", "เกษตรกร",
  "รับจ้างทั่วไป", "แม่บ้าน/พ่อบ้าน", "ว่างงาน", "เกษียณ", "อื่น ๆ",
] as const;

export const GUARDIAN_RELATIONS = ["บิดา", "มารดา", "ผู้ปกครองตามกฎหมาย", "ญาติ", "อื่น ๆ"] as const;

export const APPLICATION_STATUSES = ["submitted", "approved", "rejected"] as const;
export const VERIFICATION_STATUSES = ["pending", "verified", "incomplete"] as const;
export const PAYMENT_STATUSES = ["not_required", "pending", "paid", "waived"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = { submitted: "รอพิจารณา", approved: "ลงทะเบียนแล้ว", rejected: "ไม่ผ่านการพิจารณา" };
export const VERIFICATION_STATUS_LABEL: Record<VerificationStatus, string> = { pending: "รอตรวจหลักฐาน", verified: "หลักฐานครบถ้วน", incomplete: "หลักฐานไม่ครบ" };
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { not_required: "ไม่มีค่าใช้จ่าย", pending: "รอชำระเงิน", paid: "ชำระแล้ว", waived: "ยกเว้นค่าใช้จ่าย" };

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const MODES: readonly FieldMode[] = ["off", "optional", "required"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Normalize untrusted JSON (DB or an instructor request) into settings; invalid parts fall back to defaults. */
export function parseApplicationSettings(raw: unknown): ApplicationSettings {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const mode = (v: unknown, d: FieldMode): FieldMode => (MODES.includes(v as FieldMode) ? (v as FieldMode) : d);
  const seen = new Set<string>();
  const documents: ApplicationDocument[] = [];
  for (const d of Array.isArray(o.documents) ? o.documents : []) {
    if (!d || typeof d !== "object") continue;
    const r = d as Record<string, unknown>;
    const label = str(r.label, APPLICATION_LIMITS.docLabel);
    const key = typeof r.key === "string" && KEY_RE.test(r.key) ? r.key : `doc_${documents.length + 1}`;
    if (!label || seen.has(key)) continue;
    seen.add(key);
    documents.push({ key, label, required: r.required === true });
  }
  const fee = typeof o.fee === "number" && Number.isFinite(o.fee) ? Math.min(Math.max(Math.round(o.fee), 0), 1_000_000) : 0;
  return {
    enabled: o.enabled === true,
    courseCode: str(o.courseCode, 60),
    intake: str(o.intake, 120),
    schedule: str(o.schedule, APPLICATION_LIMITS.text),
    venue: str(o.venue, APPLICATION_LIMITS.text),
    education: mode(o.education, DEFAULT_APPLICATION_SETTINGS.education),
    occupation: mode(o.occupation, DEFAULT_APPLICATION_SETTINGS.occupation),
    documents: documents.slice(0, APPLICATION_LIMITS.documents),
    requireApproval: o.requireApproval === true,
    fee,
  };
}

/** What the applicant sends (identity is not here: it comes from the profile on the server). */
export interface ApplicationInput {
  contact: { phone: string; email: string; addressLine: string; subdistrict: string; district: string; province: string; postalCode: string };
  education?: { level: string; institution: string; qualification: string } | null | undefined;
  occupation?: { occupation: string; organization: string } | null | undefined;
  guardian?: { name: string; relation: string; phone: string; consent: boolean } | null | undefined;
  documents: Record<string, boolean>;
  declaration: { signatureName: string; accepted: boolean };
  pdpaConsent: boolean;
}

export interface ApplicationValues {
  contact: ApplicationInput["contact"];
  education: { level: string; institution: string; qualification: string } | null;
  occupation: { occupation: string; organization: string } | null;
  guardian: { name: string; relation: string; phone: string } | null;
  documents: Record<string, boolean>;
  signatureName: string;
}

export type ApplicationErrors = Partial<Record<string, string>>;

const PHONE_RE = /^0\d{8,9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (s: string) => s.replace(/[\s-]/g, "");
const sameName = (a: string, b: string) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

/**
 * Validate an application against the course settings.
 * `expectedSignature` = the applicant's Thai full name (title optional): the typed signature must match it.
 */
export function validateApplication(
  settings: ApplicationSettings,
  input: ApplicationInput,
  ctx: { minor: boolean; expectedSignature: string; expectedSignatureWithTitle?: string },
): { value: ApplicationValues | null; errors: ApplicationErrors } {
  const e: ApplicationErrors = {};
  const c = input.contact ?? ({} as ApplicationInput["contact"]);
  const contact = {
    phone: digits(str(c.phone, 20)),
    email: str(c.email, 254).toLowerCase(),
    addressLine: str(c.addressLine, 255),
    subdistrict: str(c.subdistrict, 100),
    district: str(c.district, 100),
    province: str(c.province, 100),
    postalCode: str(c.postalCode, 5),
  };
  if (!PHONE_RE.test(contact.phone)) e["contact.phone"] = "เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0812345678)";
  if (contact.email && !EMAIL_RE.test(contact.email)) e["contact.email"] = "อีเมลไม่ถูกต้อง";
  if (contact.addressLine.length < 3) e["contact.addressLine"] = "กรอกบ้านเลขที่ หมู่ ถนน";
  if (contact.subdistrict.length < 2) e["contact.subdistrict"] = "กรอกตำบล/แขวง";
  if (contact.district.length < 2) e["contact.district"] = "กรอกอำเภอ/เขต";
  if (contact.province.length < 2) e["contact.province"] = "เลือกจังหวัด";
  if (!/^\d{5}$/.test(contact.postalCode)) e["contact.postalCode"] = "รหัสไปรษณีย์ 5 หลัก";

  let education: ApplicationValues["education"] = null;
  if (settings.education !== "off") {
    const ed = {
      level: str(input.education?.level, 60),
      institution: str(input.education?.institution, APPLICATION_LIMITS.text),
      qualification: str(input.education?.qualification, APPLICATION_LIMITS.text),
    };
    const filled = !!(ed.level || ed.institution || ed.qualification);
    if (settings.education === "required" || filled) {
      if (!(EDUCATION_LEVELS as readonly string[]).includes(ed.level)) e["education.level"] = "เลือกระดับการศึกษาสูงสุด";
      if (settings.education === "required" && ed.institution.length < 2) e["education.institution"] = "กรอกชื่อสถานศึกษา";
    }
    education = filled ? ed : null;
  }

  let occupation: ApplicationValues["occupation"] = null;
  if (settings.occupation !== "off") {
    const oc = { occupation: str(input.occupation?.occupation, 60), organization: str(input.occupation?.organization, APPLICATION_LIMITS.text) };
    const filled = !!(oc.occupation || oc.organization);
    if ((settings.occupation === "required" || filled) && !(OCCUPATIONS as readonly string[]).includes(oc.occupation)) e["occupation.occupation"] = "เลือกอาชีพปัจจุบัน";
    occupation = filled ? oc : null;
  }

  let guardian: ApplicationValues["guardian"] = null;
  if (ctx.minor) {
    const g = { name: str(input.guardian?.name, 255), relation: str(input.guardian?.relation, 60), phone: digits(str(input.guardian?.phone, 20)) };
    if (g.name.length < 3) e["guardian.name"] = "กรอกชื่อ-นามสกุลผู้ปกครอง";
    if (!(GUARDIAN_RELATIONS as readonly string[]).includes(g.relation)) e["guardian.relation"] = "เลือกความสัมพันธ์";
    if (!PHONE_RE.test(g.phone)) e["guardian.phone"] = "เบอร์โทรศัพท์ผู้ปกครองไม่ถูกต้อง";
    if (input.guardian?.consent !== true) e["guardian.consent"] = "ผู้ปกครองต้องรับรองและให้ความยินยอม";
    guardian = g;
  }

  const documents: Record<string, boolean> = {};
  for (const d of settings.documents) {
    documents[d.key] = input.documents?.[d.key] === true;
    if (d.required && !documents[d.key]) e[`documents.${d.key}`] = "เอกสารนี้จำเป็นต้องยื่น";
  }

  const signatureName = str(input.declaration?.signatureName, APPLICATION_LIMITS.signature);
  if (input.declaration?.accepted !== true) e["declaration.accepted"] = "ต้องรับรองว่าข้อมูลถูกต้องตามความจริง";
  const okName = sameName(signatureName, ctx.expectedSignature) || (!!ctx.expectedSignatureWithTitle && sameName(signatureName, ctx.expectedSignatureWithTitle));
  if (!okName) e["declaration.signatureName"] = `พิมพ์ชื่อ-นามสกุลให้ตรงกับข้อมูลผู้สมัคร: ${ctx.expectedSignature}`;
  if (input.pdpaConsent !== true) e.pdpaConsent = "ต้องรับทราบประกาศความเป็นส่วนตัว";

  if (Object.keys(e).length) return { value: null, errors: e };
  return { value: { contact, education, occupation, guardian, documents, signatureName }, errors: {} };
}

/** "APP-2569-000123": Buddhist-era year of submission + a global running number. */
export function formatApplicationNo(submittedAt: Date, seq: number): string {
  const be = new Date(submittedAt.getTime() + 7 * 3600_000).getUTCFullYear() + 543; // Asia/Bangkok
  return `APP-${be}-${String(seq).padStart(6, "0")}`;
}

/** What a course offers, chosen by its owner (courses.course_type). */
export const COURSE_TYPES = ["certified_training", "short_course"] as const;
export type CourseType = (typeof COURSE_TYPES)[number];
export const COURSE_TYPE_INFO: Record<CourseType, { label: string; short: string; description: string; defaultCredentialName: string }> = {
  certified_training: {
    label: "อบรมเพื่อรับใบรับรอง",
    short: "ใบรับรอง",
    description: "เรียนออนไลน์ตามเกณฑ์ ผ่านแล้วได้รับใบรับรองดิจิทัลที่ตรวจสอบได้",
    defaultCredentialName: "ใบรับรอง",
  },
  short_course: {
    label: "หลักสูตรอบรมระยะสั้น",
    short: "ประกาศนียบัตร",
    description: "หลักสูตรระยะสั้นสำหรับประชาชนและผู้สนใจ ผ่านแล้วได้รับประกาศนียบัตร",
    defaultCredentialName: "ประกาศนียบัตร",
  },
};
export function asCourseType(v: unknown): CourseType {
  return v === "short_course" ? "short_course" : "certified_training";
}
