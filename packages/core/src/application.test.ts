import { describe, expect, it } from "vitest";
import { DEFAULT_APPLICATION_SETTINGS, formatApplicationNo, parseApplicationSettings, validateApplication, type ApplicationInput } from "./application.ts";

const base: ApplicationInput = {
  contact: { phone: "081-234-5678", email: "", addressLine: "99 หมู่ 1", subdistrict: "มาบตาพุด", district: "เมืองระยอง", province: "ระยอง", postalCode: "21150" },
  documents: {},
  declaration: { signatureName: "สมชาย ใจดี", accepted: true },
  pdpaConsent: true,
};
const ctx = { minor: false, expectedSignature: "สมชาย ใจดี", expectedSignatureWithTitle: "นายสมชาย ใจดี" };

describe("parseApplicationSettings", () => {
  it("falls back to safe defaults for junk", () => {
    expect(parseApplicationSettings("nope")).toEqual(DEFAULT_APPLICATION_SETTINGS);
    expect(parseApplicationSettings({ education: "maybe", fee: -5 })).toMatchObject({ education: "optional", fee: 0, enabled: false });
  });

  it("keeps valid documents, drops empty labels and duplicate keys", () => {
    const s = parseApplicationSettings({
      enabled: true,
      documents: [{ key: "id_card", label: "สำเนาบัตรประชาชน", required: true }, { key: "id_card", label: "dup" }, { label: "" }, { label: "รูปถ่าย" }],
    });
    expect(s.documents).toEqual([
      { key: "id_card", label: "สำเนาบัตรประชาชน", required: true },
      { key: "doc_2", label: "รูปถ่าย", required: false },
    ]);
  });
});

describe("validateApplication", () => {
  it("accepts a minimal adult application and normalizes the phone", () => {
    const r = validateApplication(DEFAULT_APPLICATION_SETTINGS, base, ctx);
    expect(r.errors).toEqual({});
    expect(r.value?.contact.phone).toBe("0812345678");
    expect(r.value?.education).toBeNull();
  });

  it("the typed signature must match the applicant's Thai name (title and spaces optional)", () => {
    expect(validateApplication(DEFAULT_APPLICATION_SETTINGS, { ...base, declaration: { signatureName: "นายสมชาย  ใจดี", accepted: true } }, ctx).errors).toEqual({});
    expect(validateApplication(DEFAULT_APPLICATION_SETTINGS, { ...base, declaration: { signatureName: "คนอื่น", accepted: true } }, ctx).errors["declaration.signatureName"]).toBeDefined();
    expect(validateApplication(DEFAULT_APPLICATION_SETTINGS, { ...base, declaration: { signatureName: "สมชาย ใจดี", accepted: false } }, ctx).errors["declaration.accepted"]).toBeDefined();
  });

  it("enforces required education/occupation and required documents", () => {
    const s = parseApplicationSettings({ education: "required", occupation: "required", documents: [{ key: "id_card", label: "บัตร", required: true }] });
    const r = validateApplication(s, base, ctx);
    expect(Object.keys(r.errors).sort()).toEqual(["documents.id_card", "education.institution", "education.level", "occupation.occupation"]);
    const ok = validateApplication(
      s,
      { ...base, education: { level: "ปวส.", institution: "วิทยาลัยเทคนิค", qualification: "" }, occupation: { occupation: "เกษตรกร", organization: "" }, documents: { id_card: true } },
      ctx,
    );
    expect(ok.errors).toEqual({});
  });

  it("requires a consenting guardian for minors only", () => {
    expect(validateApplication(DEFAULT_APPLICATION_SETTINGS, base, { ...ctx, minor: true }).errors["guardian.consent"]).toBeDefined();
    const g = { name: "สมศรี ใจดี", relation: "มารดา", phone: "0899999999", consent: true };
    expect(validateApplication(DEFAULT_APPLICATION_SETTINGS, { ...base, guardian: g }, { ...ctx, minor: true }).errors).toEqual({});
  });

  it("ignores sections that are switched off", () => {
    const s = parseApplicationSettings({ education: "off", occupation: "off" });
    const r = validateApplication(s, { ...base, education: { level: "junk", institution: "x", qualification: "" } }, ctx);
    expect(r.errors).toEqual({});
    expect(r.value?.education).toBeNull();
  });
});

describe("formatApplicationNo", () => {
  it("uses the Buddhist-era year in Bangkok time", () => {
    expect(formatApplicationNo(new Date("2026-11-18T10:00:00Z"), 42)).toBe("APP-2569-000042");
    expect(formatApplicationNo(new Date("2026-12-31T18:00:00Z"), 1)).toBe("APP-2570-000001"); // already Jan 1 in Bangkok
  });
});
