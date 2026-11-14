import { describe, expect, it } from "vitest";
import { ageOn, composeLegalNames, maskNationalId, normalizeNationalId, normalizePhone, validateProfile, type ProfileInput } from "./profile.ts";

/** Build a valid Thai national ID from 12 digits */
const withCheck = (d12: string) => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (13 - i);
  return d12 + String((11 - (sum % 11)) % 10);
};
const VALID_ID = withCheck("110170020345");
const today = new Date("2026-11-14T05:00:00Z");

const base: ProfileInput = {
  titleTh: "นาย",
  firstNameTh: "สมชาย",
  lastNameTh: "ใจดี",
  titleEn: "Mr.",
  firstNameEn: "Somchai",
  lastNameEn: "Jaidee",
  phone: "081-234-5678",
  birthDate: "1990-05-01",
  nationalId: VALID_ID.replace(/^(\d)(\d{4})(\d{5})(\d{2})(\d)$/, "$1-$2-$3-$4-$5"),
  addressLine: "99 หมู่ 1 ถนนเทวาภิบาล",
  subdistrict: "รอบเมือง",
  district: "เมืองร้อยเอ็ด",
  province: "ร้อยเอ็ด",
  postalCode: "45000",
};

describe("national id", () => {
  it("accepts a correct check digit and strips dashes", () => expect(normalizeNationalId(base.nationalId)).toBe(VALID_ID));
  it("rejects a wrong check digit, wrong length and a leading 0 or 9", () => {
    const wrong = VALID_ID.slice(0, 12) + String((Number(VALID_ID[12]) + 1) % 10);
    expect(normalizeNationalId(wrong)).toBeNull();
    expect(normalizeNationalId("123")).toBeNull();
    expect(normalizeNationalId(withCheck("010170020345"))).toBeNull();
  });
  it("masks all but the last four digits", () => expect(maskNationalId("2345")).toBe("x-xxxx-xxxx2-34-5"));
});

describe("phone", () => {
  it.each([["0812345678", "0812345678"], ["+66 81 234 5678", "0812345678"], ["02-123-4567", "021234567"]])("%s -> %s", (raw, out) => expect(normalizePhone(raw)).toBe(out));
  it("rejects garbage", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("0012345678")).toBeNull();
  });
});

describe("validateProfile", () => {
  it("normalizes a valid adult profile", () => {
    const r = validateProfile(base, today);
    expect(r.errors).toEqual({});
    expect(r.profile).toMatchObject({ phone: "0812345678", nationalId: VALID_ID, guardianName: null, province: "ร้อยเอ็ด" });
  });
  it("reports every invalid field with a Thai message", () => {
    const r = validateProfile({ ...base, firstNameTh: "Somchai", firstNameEn: "สมชาย", province: "Atlantis", postalCode: "0123", birthDate: "2030-01-01" }, today);
    expect(Object.keys(r.errors).sort()).toEqual(["birthDate", "firstNameEn", "firstNameTh", "postalCode", "province"]);
    expect(r.profile).toBeNull();
  });
  it("requires a guardian for applicants under 20", () => {
    const minor = { ...base, titleTh: "นางสาว", birthDate: "2010-01-01" };
    expect(Object.keys(validateProfile(minor, today).errors).sort()).toEqual(["guardianConsent", "guardianName", "guardianPhone"]);
    const ok = validateProfile({ ...minor, guardianName: "นางสมศรี ใจดี", guardianPhone: "0899999999", guardianConsent: true }, today);
    expect(ok.profile?.guardianPhone).toBe("0899999999");
  });
  it("refuses applicants younger than 10", () => expect(validateProfile({ ...base, birthDate: "2020-01-01" }, today).errors.birthDate).toBeTruthy());
});

describe("names and age", () => {
  it("composes certificate names", () => expect(composeLegalNames(base)).toEqual({ th: "นายสมชาย ใจดี", en: "Mr. Somchai Jaidee" }));
  it("counts age in Bangkok time", () => {
    expect(ageOn("2006-11-14", new Date("2026-11-13T17:30:00Z"))).toBe(20); // already the 14th in Bangkok
    expect(ageOn("2006-11-15", new Date("2026-11-14T05:00:00Z"))).toBe(19);
  });
});
