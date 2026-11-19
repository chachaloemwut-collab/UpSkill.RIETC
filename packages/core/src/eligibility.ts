// Who may register for a cohort. Rules are stored as JSON on the cohort; this module is the only place that
// interprets them, so the web app, the admin preview and the tests all agree.

export interface ApplicationField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "date" | "number";
  required: boolean;
  options?: string[];
  showIf?: { field: string; value: string };
}

export interface EligibilityRules {
  /** Lower-case domains, e.g. ["rietc.ac.th"]. Empty = any email */
  emailDomains: string[];
  /** Learning group ids; the applicant must be in at least one (any) or all (all). Default: any */
  groupIds: string[];
  groupMode: "any" | "all";
  /** Applicant must have entered a legal name (needed later for the certificate) */
  requireLegalName: boolean;
  /** Courses the applicant must already have completed; mode controls whether any or all required */
  prerequisiteCourseIds: string[];
  prerequisiteMode: "any" | "all";
  applicationForm: ApplicationField[];
}

export const EMPTY_RULES: EligibilityRules = { emailDomains: [], groupIds: [], groupMode: "any", requireLegalName: false, prerequisiteCourseIds: [], prerequisiteMode: "all", applicationForm: [] };

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
    const TYPES = ["text", "textarea", "select", "date", "number"] as const;
    const type = TYPES.includes(r.type as (typeof TYPES)[number]) ? (r.type as ApplicationField["type"]) : "text";
    const options = type === "select" && Array.isArray(r.options)
      ? (r.options as unknown[]).filter((o): o is string => typeof o === "string" && o.trim().length > 0).map((o) => o.trim().slice(0, 120)).slice(0, 20)
      : undefined;
    const rawShowIf = r.showIf && typeof r.showIf === "object" ? (r.showIf as Record<string, unknown>) : null;
    const showIf: ApplicationField["showIf"] = rawShowIf && typeof rawShowIf.field === "string" && typeof rawShowIf.value === "string"
      ? { field: rawShowIf.field as string, value: rawShowIf.value as string }
      : undefined;
    const field: ApplicationField = { key, label, type, required: r.required === true };
    if (options) field.options = options;
    if (showIf) field.showIf = showIf;
    applicationForm.push(field);
  }
  return {
    emailDomains: domains.slice(0, ELIGIBILITY_LIMITS.domains),
    groupIds: groupIds.slice(0, ELIGIBILITY_LIMITS.groups),
    groupMode: o.groupMode === "all" ? "all" : "any",
    requireLegalName: o.requireLegalName === true,
    prerequisiteCourseIds: prerequisiteCourseIds.slice(0, ELIGIBILITY_LIMITS.prerequisites),
    prerequisiteMode: o.prerequisiteMode === "any" ? "any" : "all",
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
  if (rules.groupIds.length) {
    const mode = rules.groupMode ?? "any";
    const failGroup = mode === "all"
      ? !rules.groupIds.every((g) => groups.has(g))
      : !rules.groupIds.some((g) => groups.has(g));
    if (failGroup) reasons.push({ code: "GROUP", message: mode === "all" ? "ต้องเป็นสมาชิกทุกกลุ่มที่กำหนด" : "เปิดรับเฉพาะสมาชิกกลุ่มผู้เรียนที่กำหนด" });
  }
  if (rules.requireLegalName && !a.hasLegalName) {
    reasons.push({ code: "LEGAL_NAME", message: "กรุณากรอกชื่อ-นามสกุลจริงในหน้าตั้งค่าบัญชีก่อนสมัคร" });
  }
  const done = new Set(a.completedCourseIds.map((c) => c.toLowerCase()));
  const prereqMode = rules.prerequisiteMode ?? "all";
  if (prereqMode === "any" && rules.prerequisiteCourseIds.length && !rules.prerequisiteCourseIds.some((id) => done.has(id))) {
    const names = rules.prerequisiteCourseIds.map((id) => `"${courseTitles[id] ?? "ที่กำหนด"}"`).join(" หรือ ");
    reasons.push({ code: "PREREQUISITE", courseId: rules.prerequisiteCourseIds[0]!, message: `ต้องเรียนจบรายวิชาอย่างน้อยหนึ่งในนี้: ${names}` });
  } else if (prereqMode === "all") {
    for (const id of rules.prerequisiteCourseIds) {
      if (!done.has(id)) reasons.push({ code: "PREREQUISITE", courseId: id, message: `ต้องเรียนจบรายวิชา "${courseTitles[id] ?? "ที่กำหนด"}" ก่อน` });
    }
  }
  return reasons;
}

/** Validate and trim answers against the form. Unknown keys are dropped (never stored). */
export function normalizeAnswers(form: ApplicationField[], raw: unknown): { answers: Record<string, string>; errors: string[] } {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const answers: Record<string, string> = {};
  const errors: string[] = [];
  for (const f of form) {
    // Skip fields whose showIf condition is not met
    if (f.showIf && answers[f.showIf.field] !== f.showIf.value) continue;
    const v = typeof input[f.key] === "string" ? (input[f.key] as string).trim() : "";
    if (v.length > ELIGIBILITY_LIMITS.answerLength) { errors.push(`"${f.label}" ยาวเกินไป`); continue; }
    if (f.required && !v) { errors.push(`กรุณากรอก "${f.label}"`); continue; }
    if (f.type === "select" && v && f.options && !f.options.includes(v)) { errors.push(`"${f.label}" มีค่าที่ไม่ถูกต้อง`); continue; }
    if (v) answers[f.key] = v;
  }
  return { answers, errors };
}

/** Human-readable summary of the rules for the public program page */
export function describeRules(rules: EligibilityRules, groupNames: Record<string, string> = {}, courseTitles: Record<string, string> = {}): string[] {
  const lines: string[] = [];
  if (rules.emailDomains.length) lines.push(`ใช้อีเมล ${rules.emailDomains.map((d) => `@${d}`).join(", ")}`);
  if (rules.groupIds.length) {
    const sep = (rules.groupMode ?? "any") === "all" ? " และ " : " หรือ ";
    lines.push(`เป็นสมาชิกกลุ่ม ${rules.groupIds.map((g) => groupNames[g] ?? "ที่กำหนด").join(sep)}`);
  }
  if (rules.requireLegalName) lines.push("กรอกชื่อ-นามสกุลจริงในบัญชีแล้ว");
  if ((rules.prerequisiteMode ?? "all") === "any" && rules.prerequisiteCourseIds.length) {
    lines.push(`เรียนจบอย่างน้อยหนึ่งในนี้: ${rules.prerequisiteCourseIds.map((id) => `"${courseTitles[id] ?? "ที่กำหนด"}"`).join(", ")}`);
  } else {
    for (const id of rules.prerequisiteCourseIds) lines.push(`เรียนจบรายวิชา "${courseTitles[id] ?? "ที่กำหนด"}" แล้ว`);
  }
  return lines;
}
