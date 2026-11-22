// Member profile collected at sign-up (PDPA-scoped). Pure rules shared by the sign-up form, the profile page and
// the server, so the browser and the API reject exactly the same input.

/** Bump when the privacy notice text changes: consent is recorded against this version */
export const PDPA_NOTICE_VERSION = "2026-11-14";

/** Under this age (Thai civil majority) a guardian's consent is recorded too */
export const ADULT_AGE = 20;
/** First name and surname: two words, 3–255 characters */
const GUARDIAN_FULL_NAME = /^(?=.{3,255}$)\S+(\s+\S+)+$/;
/** What an applicant under ADULT_AGE ticks, in the wording of a short vocational course paper form */
export const GUARDIAN_CONSENT_TEXT = "ข้าพเจ้าขอยืนยันว่า การสมัครเรียนครั้งนี้ข้าพเจ้าได้ขออนุญาตและได้รับความยินยอมจากผู้ปกครองแล้ว";
/** Shown wherever an applicant submits, and printed on the application */
export const ELECTRONIC_SIGNATURE_STATEMENT =
  "การกรอกและส่งข้อมูลในระบบนี้ ถือเป็นการสมัครเรียนหลักสูตรวิชาชีพระยะสั้นของวิทยาลัยเทคนิคนิคมอุตสาหกรรมระยอง และมีผลเสมือนผู้สมัครได้ลงลายมือชื่อในใบสมัครที่เป็นกระดาษทุกประการ";
export const MIN_AGE = 10;

export const TITLES_TH = ["นาย", "นาง", "นางสาว", "เด็กชาย", "เด็กหญิง", "ดร.", "ผศ.", "รศ.", "ศ.", "ว่าที่ร้อยตรี"] as const;
export const TITLES_EN = ["Mr.", "Mrs.", "Ms.", "Miss", "Master", "Dr.", "Asst. Prof.", "Assoc. Prof.", "Prof."] as const;

export const THAI_PROVINCES = [
  "กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท",
  "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม",
  "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์",
  "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์",
  "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง",
  "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ",
  "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย",
  "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี",
] as const;

const digits = (s: string) => s.replace(/[\s-]/g, "");

/** 13-digit Thai national ID with its mod-11 check digit */
export function normalizeNationalId(raw: string): string | null {
  const id = digits(raw);
  if (!/^[1-8]\d{12}$/.test(id)) return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]) ? id : null;
}

/** Thai phone number as 0XXXXXXXX(X); accepts +66 / spaces / dashes */
export function normalizePhone(raw: string): string | null {
  let p = digits(raw).replace(/^\+?66/, "0");
  if (!p.startsWith("0")) p = `0${p}`;
  return /^0[2-9]\d{7,8}$/.test(p) ? p : null;
}

export function ageOn(birthDate: string, today: Date): number {
  const [y, m, d] = birthDate.split("-").map(Number) as [number, number, number];
  // Bangkok calendar date of "today"
  const t = new Date(today.getTime() + 7 * 3600_000);
  let age = t.getUTCFullYear() - y;
  if (t.getUTCMonth() + 1 < m || (t.getUTCMonth() + 1 === m && t.getUTCDate() < d)) age--;
  return age;
}

const THAI_NAME = /^[฀-๿][฀-๿ .'-]{0,99}$/;
const LATIN_NAME = /^[A-Za-z][A-Za-z .'-]{0,99}$/;
const TITLE_TH = /^[฀-๿][฀-๿ .]{0,39}$/;
const TITLE_EN = /^[A-Za-z][A-Za-z .]{0,39}$/;

export interface ProfileInput {
  titleTh: string;
  firstNameTh: string;
  lastNameTh: string;
  titleEn: string;
  firstNameEn: string;
  lastNameEn: string;
  phone: string;
  birthDate: string;
  nationalId: string;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  guardianName?: string | null | undefined;
  guardianPhone?: string | null | undefined;
  guardianConsent?: boolean | undefined;
}

export interface Profile {
  titleTh: string;
  firstNameTh: string;
  lastNameTh: string;
  titleEn: string;
  firstNameEn: string;
  lastNameEn: string;
  phone: string;
  birthDate: string;
  nationalId: string;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  guardianName: string | null;
  guardianPhone: string | null;
}

export type ProfileErrors = Partial<Record<keyof ProfileInput, string>>;

const clean = (s: string | null | undefined) => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

/** Validate and normalize every field; returns per-field Thai messages for the form */
export function validateProfile(input: ProfileInput, today = new Date()): { profile: Profile | null; errors: ProfileErrors } {
  const e: ProfileErrors = {};
  const v = {
    titleTh: clean(input.titleTh),
    firstNameTh: clean(input.firstNameTh),
    lastNameTh: clean(input.lastNameTh),
    titleEn: clean(input.titleEn),
    firstNameEn: clean(input.firstNameEn),
    lastNameEn: clean(input.lastNameEn),
    addressLine: clean(input.addressLine),
    subdistrict: clean(input.subdistrict),
    district: clean(input.district),
    province: clean(input.province),
  };
  if (!TITLE_TH.test(v.titleTh)) e.titleTh = "กรุณาเลือกหรือระบุคำนำหน้าภาษาไทย";
  if (!THAI_NAME.test(v.firstNameTh)) e.firstNameTh = "กรอกชื่อเป็นภาษาไทย";
  if (!THAI_NAME.test(v.lastNameTh)) e.lastNameTh = "กรอกนามสกุลเป็นภาษาไทย";
  if (!TITLE_EN.test(v.titleEn)) e.titleEn = "กรุณาเลือกหรือระบุคำนำหน้าภาษาอังกฤษ";
  if (!LATIN_NAME.test(v.firstNameEn)) e.firstNameEn = "กรอกชื่อเป็นภาษาอังกฤษ";
  if (!LATIN_NAME.test(v.lastNameEn)) e.lastNameEn = "กรอกนามสกุลเป็นภาษาอังกฤษ";

  const phone = normalizePhone(input.phone ?? "");
  if (!phone) e.phone = "เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0812345678)";
  const nationalId = normalizeNationalId(input.nationalId ?? "");
  if (!nationalId) e.nationalId = "เลขประจำตัวประชาชนไม่ถูกต้อง (13 หลัก)";

  const birthDate = (input.birthDate ?? "").trim();
  let age = -1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`)) || birthDate < "1900-01-01") {
    e.birthDate = "วันเกิดไม่ถูกต้อง";
  } else {
    age = ageOn(birthDate, today);
    if (age < 0) e.birthDate = "วันเกิดต้องไม่อยู่ในอนาคต";
    else if (age < MIN_AGE) e.birthDate = `ผู้สมัครต้องมีอายุอย่างน้อย ${MIN_AGE} ปี`;
    else if (age > 120) e.birthDate = "วันเกิดไม่ถูกต้อง";
  }

  if (v.addressLine.length < 3 || v.addressLine.length > 255) e.addressLine = "กรอกบ้านเลขที่ หมู่ ถนน";
  if (v.subdistrict.length < 2 || v.subdistrict.length > 100) e.subdistrict = "กรอกตำบล/แขวง";
  if (v.district.length < 2 || v.district.length > 100) e.district = "กรอกอำเภอ/เขต";
  if (!(THAI_PROVINCES as readonly string[]).includes(v.province)) e.province = "เลือกจังหวัด";
  const postalCode = digits(input.postalCode ?? "");
  if (!/^[1-9]\d{4}$/.test(postalCode)) e.postalCode = "รหัสไปรษณีย์ 5 หลัก";

  let guardianName: string | null = null;
  let guardianPhone: string | null = null;
  if (age >= 0 && age < ADULT_AGE) {
    // Only the guardian's full name and the applicant's confirmation are required. A phone number given on
    // older forms is kept when it is valid, never asked for.
    guardianName = clean(input.guardianName);
    guardianPhone = input.guardianPhone ? normalizePhone(input.guardianPhone) : null;
    if (!GUARDIAN_FULL_NAME.test(guardianName)) e.guardianName = "กรอกชื่อและนามสกุลของผู้ปกครอง เช่น นางสมศรี ใจดี";
    if (input.guardianConsent !== true) e.guardianConsent = "ติ๊กยืนยันว่าได้รับอนุญาตจากผู้ปกครองแล้ว";
  }

  if (Object.keys(e).length) return { profile: null, errors: e };
  return { profile: { ...v, phone: phone!, nationalId: nationalId!, birthDate, postalCode, guardianName, guardianPhone }, errors: {} };
}

/** Names as printed on certificates: Thai without a space after the title, English with one */
export function composeLegalNames(p: Pick<Profile, "titleTh" | "firstNameTh" | "lastNameTh" | "titleEn" | "firstNameEn" | "lastNameEn">) {
  return { th: `${p.titleTh}${p.firstNameTh} ${p.lastNameTh}`, en: `${p.titleEn} ${p.firstNameEn} ${p.lastNameEn}` };
}

export function maskNationalId(last4: string): string {
  // 13 digits are grouped 1-4-5-2-1; the last four digits span the last three groups
  return `x-xxxx-xxxx${last4.slice(0, 1)}-${last4.slice(1, 3)}-${last4.slice(3)}`;
}
