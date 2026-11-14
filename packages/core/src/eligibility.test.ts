import { describe, expect, it } from "vitest";
import { describeRules, evaluateEligibility, normalizeAnswers, parseEligibilityRules, type Applicant } from "./eligibility.ts";

const G = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const C = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c";
const applicant: Applicant = { email: "teacher@rietc.ac.th", hasLegalName: true, groupIds: [G], completedCourseIds: [C] };

describe("parseEligibilityRules", () => {
  it("returns empty rules for garbage", () => {
    expect(parseEligibilityRules(null)).toEqual({ emailDomains: [], groupIds: [], requireLegalName: false, prerequisiteCourseIds: [], applicationForm: [] });
    expect(parseEligibilityRules([1, 2])).toMatchObject({ emailDomains: [] });
  });
  it("normalizes domains and drops invalid ids and fields", () => {
    const r = parseEligibilityRules({
      emailDomains: ["@RIETC.ac.th", "not a domain", "rietc.ac.th"],
      groupIds: [G, "x"],
      prerequisiteCourseIds: [C.toUpperCase()],
      requireLegalName: "yes",
      applicationForm: [{ key: "org", label: "หน่วยงาน", required: true }, { key: "org", label: "dup" }, { key: "Bad Key", label: "x" }, { key: "why", label: "" }],
    });
    expect(r.emailDomains).toEqual(["rietc.ac.th"]);
    expect(r.groupIds).toEqual([G]);
    expect(r.prerequisiteCourseIds).toEqual([C]);
    expect(r.requireLegalName).toBe(false);
    expect(r.applicationForm).toEqual([{ key: "org", label: "หน่วยงาน", type: "text", required: true }]);
  });
});

describe("evaluateEligibility", () => {
  it("accepts anyone when there are no rules", () => {
    expect(evaluateEligibility(parseEligibilityRules({}), { email: "x@gmail.com", hasLegalName: false, groupIds: [], completedCourseIds: [] })).toEqual([]);
  });
  it("accepts an applicant who meets every rule, including subdomains", () => {
    const rules = parseEligibilityRules({ emailDomains: ["ac.th"], groupIds: [G], requireLegalName: true, prerequisiteCourseIds: [C] });
    expect(evaluateEligibility(rules, applicant)).toEqual([]);
  });
  it("does not treat a look-alike domain as a subdomain", () => {
    const rules = parseEligibilityRules({ emailDomains: ["rietc.ac.th"] });
    expect(evaluateEligibility(rules, { ...applicant, email: "x@evilrietc.ac.th" })).toHaveLength(1);
  });
  it("reports every failed rule with a readable message", () => {
    const rules = parseEligibilityRules({ emailDomains: ["vec.go.th"], groupIds: [G], requireLegalName: true, prerequisiteCourseIds: [C] });
    const reasons = evaluateEligibility(rules, { email: "a@gmail.com", hasLegalName: false, groupIds: [], completedCourseIds: [] }, { [C]: "พื้นฐาน" });
    expect(reasons.map((r) => r.code)).toEqual(["EMAIL_DOMAIN", "GROUP", "LEGAL_NAME", "PREREQUISITE"]);
    expect(reasons.at(-1)?.message).toContain("พื้นฐาน");
  });
});

describe("normalizeAnswers", () => {
  const form = parseEligibilityRules({ applicationForm: [{ key: "org", label: "หน่วยงาน", required: true }, { key: "why", label: "เหตุผล", type: "textarea" }] }).applicationForm;
  it("requires required fields and drops unknown keys", () => {
    expect(normalizeAnswers(form, { why: "x", extra: "secret" })).toEqual({ answers: { why: "x" }, errors: ['กรุณากรอก "หน่วยงาน"'] });
  });
  it("trims values and rejects overly long answers", () => {
    expect(normalizeAnswers(form, { org: "  RIETC " }).answers).toEqual({ org: "RIETC" });
    expect(normalizeAnswers(form, { org: "x".repeat(2001) }).errors).toHaveLength(1);
  });
});

describe("describeRules", () => {
  it("summarizes the rules for applicants", () => {
    const rules = parseEligibilityRules({ emailDomains: ["rietc.ac.th"], groupIds: [G], prerequisiteCourseIds: [C] });
    expect(describeRules(rules, { [G]: "ครูแกนนำ" }, { [C]: "พื้นฐาน" })).toEqual(["ใช้อีเมล @rietc.ac.th", "เป็นสมาชิกกลุ่ม ครูแกนนำ", 'เรียนจบรายวิชา "พื้นฐาน" แล้ว']);
  });
});
