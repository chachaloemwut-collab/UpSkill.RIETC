// Who may register for a cohort. Rules are stored as JSON on the cohort; this module is the only place that
// interprets them, so the web app, the admin preview and the tests all agree.

export interface ApplicationField {
  key: string;
  label: string;
  type: "text" | "textarea";
  required: boolean;
}

export interface EligibilityRules {
  /** Lower-case domains, e.g. ["rietc.ac.th"]. Empty = any email */
  emailDomains: string[];
  /** Learning group ids; the applicant must be in at least one. Empty = no group required */
  groupIds: string[];
  /** Applicant must have entered a legal name (needed later for the certificate) */
  requireLegalName: boolean;
  /** Courses the applicant must already have completed */
  prerequisiteCourseIds: string[];
  applicationForm: ApplicationField[];
}

export const EMPTY_RULES: EligibilityRules = { emailDomains: [], groupIds: [], requireLegalName: false, prerequisiteCourseIds: [], applicationForm: [] };

export const ELIGIBILITY_LIMITS = { domains: 20, groups: 20, prerequisites: 20, fields: 10, answerLength: 2000 } as const;

const DOMAIN_RE = /^(?=.{3,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * Normalize untrusted JSON (from the DB or an admin request) into rules. Invalid entries are dropped, so a bad
 * value can never make the check more permissive than what an admin can see in the editor.
 */
export function parseEligibilityRules(raw: unknown): EligibilityRules {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const domains = [...new Set(strings(o.emailDomains).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter((d) => DOMAIN_RE.test(d)))];
  const groupIds = [...new Set(strings(o.groupIds).filter((id) => UUID_RE.test(id)).map((id) => id.toLowerCase()))];
  const prerequisiteCourseIds = [...new Set(strings(o.prerequisiteCourseIds).filter((id) => UUID_RE.test(id)).map((id) => id.toLowerCase()))];
  const seen = new Set<string>();
  const applicationForm: ApplicationField[] = [];
  for (const f of Array.isArray(o.applicationForm) ? o.applicationForm : []) {
    if (!f || typeof f !== "object") continue;
    const r = f as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.trim() : "";
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 120) : "";
    if (!KEY_RE.test(key) || !label || seen.has(key)) continue;
    seen.add(key);
    applicationForm.push({ key, label, type: r.type === "textarea" ? "textarea" : "text", required: r.required === true });
  }
  return {
    emailDomains: domains.slice(0, ELIGIBILITY_LIMITS.domains),
    groupIds: groupIds.slice(0, ELIGIBILITY_LIMITS.groups),
    requireLegalName: o.requireLegalName === true,
    prerequisiteCourseIds: prerequisiteCourseIds.slice(0, ELIGIBILITY_LIMITS.prerequisites),
    applicationForm: applicationForm.slice(0, ELIGIBILITY_LIMITS.fields),
  };
}

export interface Applicant {
  email: string;
  hasLegalName: boolean;
  groupIds: string[];
  completedCourseIds: string[];
}

export type IneligibleReason =
  | { code: "EMAIL_DOMAIN"; message: string }
  | { code: "GROUP"; message: string }
  | { code: "LEGAL_NAME"; message: string }
  | { code: "PREREQUISITE"; message: string; courseId: string };

export function evaluateEligibility(rules: EligibilityRules, a: Applicant, courseTitles: Record<string, string> = {}): IneligibleReason[] {
  const reasons: IneligibleReason[] = [];
  const domain = a.email.trim().toLowerCase().split("@").at(-1) ?? "";
  if (rules.emailDomains.length && !rules.emailDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    reasons.push({ code: "EMAIL_DOMAIN", message: `เปิดรับเฉพาะอีเมล ${rules.emailDomains.map((d) => `@${d}`).join(", ")}` });
  }
  const groups = new Set(a.groupIds.map((g) => g.toLowerCase()));
  if (rules.groupIds.length && !rules.groupIds.some((g) => groups.has(g))) {
    reasons.push({ code: "GROUP", message: "เปิดรับเฉพาะสมาชิกกลุ่มผู้เรียนที่กำหนด" });
  }
  if (rules.requireLegalName && !a.hasLegalName) {
    reasons.push({ code: "LEGAL_NAME", message: "กรุณากรอกชื่อ-นามสกุลจริงในหน้าตั้งค่าบัญชีก่อนสมัคร" });
  }
  const done = new Set(a.completedCourseIds.map((c) => c.toLowerCase()));
  for (const id of rules.prerequisiteCourseIds) {
    if (!done.has(id)) reasons.push({ code: "PREREQUISITE", courseId: id, message: `ต้องเรียนจบรายวิชา "${courseTitles[id] ?? "ที่กำหนด"}" ก่อน` });
  }
  return reasons;
}

/** Validate and trim answers against the form. Unknown keys are dropped (never stored). */
export function normalizeAnswers(form: ApplicationField[], raw: unknown): { answers: Record<string, string>; errors: string[] } {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const answers: Record<string, string> = {};
  const errors: string[] = [];
  for (const f of form) {
    const v = typeof input[f.key] === "string" ? (input[f.key] as string).trim() : "";
    if (v.length > ELIGIBILITY_LIMITS.answerLength) errors.push(`"${f.label}" ยาวเกินไป`);
    else if (f.required && !v) errors.push(`กรุณากรอก "${f.label}"`);
    else if (v) answers[f.key] = v;
  }
  return { answers, errors };
}

/** Human-readable summary of the rules for the public program page */
export function describeRules(rules: EligibilityRules, groupNames: Record<string, string> = {}, courseTitles: Record<string, string> = {}): string[] {
  const lines: string[] = [];
  if (rules.emailDomains.length) lines.push(`ใช้อีเมล ${rules.emailDomains.map((d) => `@${d}`).join(", ")}`);
  if (rules.groupIds.length) lines.push(`เป็นสมาชิกกลุ่ม ${rules.groupIds.map((g) => groupNames[g] ?? "ที่กำหนด").join(" หรือ ")}`);
  if (rules.requireLegalName) lines.push("กรอกชื่อ-นามสกุลจริงในบัญชีแล้ว");
  for (const id of rules.prerequisiteCourseIds) lines.push(`เรียนจบรายวิชา "${courseTitles[id] ?? "ที่กำหนด"}" แล้ว`);
  return lines;
}
