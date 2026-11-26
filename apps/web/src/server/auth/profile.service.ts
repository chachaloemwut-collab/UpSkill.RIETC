/**
 * Member profile (personal data under the PDPA notice). The national ID is stored as a keyed digest (uniqueness),
 * AES-256-GCM ciphertext (authorised retrieval) and its last 4 digits (display); never in clear, never logged.
 */
import "server-only";
import { normalizePhone, THAI_PROVINCES } from "@upskill/core/profile";
import { z } from "zod";
import { PDPA_NOTICE_VERSION, composeLegalNames, maskNationalId, validateProfile, type Profile, type ProfileInput } from "@upskill/core";
import { PG, pgErrorCode, type Tx } from "@upskill/db";
import { decryptSettingSecret, encryptSettingSecret, nationalIdDigest } from "@upskill/infra/secret-box";
import { ctx } from "../context";
import { HttpError } from "../http";
import { audit } from "../audit";

/** Request shape shared by sign-up and the profile page; values are validated by validateProfile (packages/core) */
export const ProfileBody = z.strictObject({
  titleTh: z.string().max(40),
  firstNameTh: z.string().max(100),
  lastNameTh: z.string().max(100),
  titleEn: z.string().max(40),
  firstNameEn: z.string().max(100),
  lastNameEn: z.string().max(100),
  phone: z.string().max(20),
  birthDate: z.string().max(10),
  nationalId: z.string().max(20),
  addressLine: z.string().max(255),
  subdistrict: z.string().max(100),
  district: z.string().max(100),
  province: z.string().max(100),
  postalCode: z.string().max(10),
  guardianName: z.string().max(255).nullable().optional(),
  guardianPhone: z.string().max(20).nullable().optional(),
  guardianConsent: z.boolean().optional(),
});

export function checkedProfile(input: ProfileInput): Profile {
  const { profile, errors } = validateProfile(input);
  if (!profile) throw new HttpError(400, "PROFILE_INVALID", Object.values(errors).join(" · "));
  return profile;
}

const key = () => ctx().env.SETTINGS_ENCRYPTION_KEY;
const digestOf = (nationalId: string) => nationalIdDigest(nationalId, key());

export async function nationalIdInUse(nationalId: string): Promise<boolean> {
  const row = await ctx().db.selectFrom("user_profiles").select("user_id").where("national_id_hmac", "=", digestOf(nationalId)).executeTakeFirst();
  return !!row;
}

const editable = (p: Profile, now: Date) => ({
  phone: p.phone,
  birth_date: p.birthDate,
  address_line: p.addressLine,
  subdistrict: p.subdistrict,
  district: p.district,
  province: p.province,
  postal_code: p.postalCode,
  guardian_name: p.guardianName,
  guardian_phone: p.guardianPhone,
  guardian_consented_at: p.guardianName ? now : null,
});
const names = (p: Profile) => ({
  title_th: p.titleTh,
  first_name_th: p.firstNameTh,
  last_name_th: p.lastNameTh,
  title_en: p.titleEn,
  first_name_en: p.firstNameEn,
  last_name_en: p.lastNameEn,
});

/** Insert the profile in the caller's transaction; also fills the certificate names while they are unlocked */
export async function insertProfile(trx: Tx, userId: string, p: Profile) {
  const now = new Date();
  await trx.selectFrom("users").select("id").where("id", "=", userId).forUpdate().executeTakeFirstOrThrow();
  const current = await trx.selectFrom("user_profiles").select("national_id_hmac").where("user_id", "=", userId).executeTakeFirst();
  if (current) {
    if (current.national_id_hmac?.equals(digestOf(p.nationalId))) return;
    throw new HttpError(409, "PROFILE_ALREADY_EXISTS", "ข้อมูลผู้เรียนเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่");
  }
  try {
    await trx
      .insertInto("user_profiles")
      .values({
        user_id: userId,
        ...names(p),
        ...editable(p, now),
        national_id_hmac: digestOf(p.nationalId),
        national_id_encrypted: encryptSettingSecret(p.nationalId, key()),
        national_id_last4: p.nationalId.slice(-4),
        pdpa_notice_version: PDPA_NOTICE_VERSION,
        pdpa_consented_at: now,
      })
      .execute();
  } catch (err) {
    if (pgErrorCode(err) === PG.UNIQUE_VIOLATION) throw new HttpError(409, "NATIONAL_ID_IN_USE", NATIONAL_ID_IN_USE);
    throw err;
  }
  const legal = composeLegalNames(p);
  await trx.updateTable("users").set({ legal_full_name_th: legal.th, legal_full_name_en: legal.en }).where("id", "=", userId).where("legal_name_locked_at", "is", null).execute();
}

export const NATIONAL_ID_IN_USE = "เลขประจำตัวประชาชนนี้มีบัญชีในระบบแล้ว กรุณาเข้าสู่ระบบด้วยบัญชีเดิม หรือติดต่อผู้ดูแลระบบ";

export async function hasProfile(userId: string): Promise<boolean> {
  const row = await ctx().db.selectFrom("user_profiles").select("user_id").where("user_id", "=", userId).executeTakeFirst();
  return !!row;
}

/** Enrollment and cohort applications need the full profile (identity for the certificate, contact for training) */
export async function assertProfileComplete(userId: string) {
  if (!(await hasProfile(userId))) throw new HttpError(403, "PROFILE_REQUIRED", "กรุณากรอกข้อมูลผู้เรียนให้ครบในหน้าตั้งค่าบัญชีก่อน");
}

export async function getMyProfile(userId: string) {
  const { db } = ctx();
  const [p, u] = await Promise.all([
    db
      .selectFrom("user_profiles")
      .select([
        "title_th", "first_name_th", "last_name_th", "title_en", "first_name_en", "last_name_en", "phone", "birth_date",
        "address_line", "subdistrict", "district", "province", "postal_code", "national_id_last4",
        "guardian_name", "guardian_phone", "pdpa_notice_version", "pdpa_consented_at",
      ])
      .where("user_id", "=", userId)
      .executeTakeFirst(),
    db.selectFrom("users").select(["legal_name_locked_at"]).where("id", "=", userId).executeTakeFirstOrThrow(),
  ]);
  if (!p) return { profile: null, namesLocked: !!u.legal_name_locked_at };
  return {
    profile: { ...p, birth_date: toIsoDate(p.birth_date), national_id_masked: maskNationalId(p.national_id_last4) },
    namesLocked: !!u.legal_name_locked_at,
  };
}

export function toIsoDate(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  // DATE columns arrive as local-midnight Dates from node-postgres
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Create the profile (first time: consent + national ID required) or update it.
 * The national ID can't change once set; names can't change after the certificate name is locked.
 */
export async function saveMyProfile(userId: string, input: ProfileInput & { pdpaConsent?: boolean | undefined }, meta: { ip: string; userAgent: string }) {
  const { db } = ctx();
  const existing = await db.selectFrom("user_profiles").select(["national_id_hmac", "national_id_encrypted"]).where("user_id", "=", userId).executeTakeFirst();
  if (!existing) {
    if (input.pdpaConsent !== true) throw new HttpError(400, "PDPA_CONSENT_REQUIRED", "กรุณายอมรับประกาศความเป็นส่วนตัวก่อนบันทึกข้อมูล");
    const p = checkedProfile(input);
    await db.transaction().execute((trx) => insertProfile(trx, userId, p));
    await audit(db, { action: "user.pdpa_consent", userId, ip: meta.ip, userAgent: meta.userAgent, details: { notice: PDPA_NOTICE_VERSION, via: "profile" } });
    return;
  }
  // The form shows the ID masked, so an empty value means "unchanged"
  const p = checkedProfile({ ...input, nationalId: input.nationalId.trim() || decryptSettingSecret(existing.national_id_encrypted, key()) });
  if (!digestOf(p.nationalId).equals(existing.national_id_hmac)) {
    throw new HttpError(409, "NATIONAL_ID_LOCKED", "เลขประจำตัวประชาชนแก้ไขไม่ได้ หากบันทึกผิด กรุณาติดต่อผู้ดูแลระบบ");
  }
  const locked = await db.selectFrom("users").select("legal_name_locked_at").where("id", "=", userId).executeTakeFirstOrThrow();
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("user_profiles")
      .set({ ...editable(p, new Date()), ...(locked.legal_name_locked_at ? {} : names(p)) })
      .where("user_id", "=", userId)
      .execute();
    if (!locked.legal_name_locked_at) {
      const legal = composeLegalNames(p);
      await trx.updateTable("users").set({ legal_full_name_th: legal.th, legal_full_name_en: legal.en }).where("id", "=", userId).where("legal_name_locked_at", "is", null).execute();
    }
  });
}

export const ContactPatch = z.strictObject({
  phone: z.string().max(20).refine(v => normalizePhone(v) !== null, "เบอร์โทรศัพท์ไม่ถูกต้อง").transform(v => normalizePhone(v)!).optional(),
  addressLine: z.string().trim().min(3).max(255).optional(),
  subdistrict: z.string().trim().min(2).max(100).optional(),
  district: z.string().trim().min(2).max(100).optional(),
  province: z.enum(THAI_PROVINCES).optional(),
  postalCode: z.string().trim().regex(/^[1-9]\d{4}$/, "กรุณากรอกรหัสไปรษณีย์ 5 หลัก").optional(),
});

/** Patch only contact/address fields; never touches identity or name. */
export async function updateContactInfo(userId: string, patch: z.infer<typeof ContactPatch>) {
  const { db } = ctx();
  const exists = await db.selectFrom("user_profiles").select("user_id").where("user_id", "=", userId).executeTakeFirst();
  if (!exists) throw new HttpError(404, "PROFILE_NOT_FOUND", "กรุณากรอกข้อมูลส่วนตัวก่อน");
  const set: Record<string, string> = {};
  if (patch.phone !== undefined) set.phone = patch.phone;
  if (patch.addressLine !== undefined) set.address_line = patch.addressLine;
  if (patch.subdistrict !== undefined) set.subdistrict = patch.subdistrict;
  if (patch.district !== undefined) set.district = patch.district;
  if (patch.province !== undefined) set.province = patch.province;
  if (patch.postalCode !== undefined) set.postal_code = patch.postalCode;
  if (Object.keys(set).length === 0) return;
  await db.updateTable("user_profiles").set(set).where("user_id", "=", userId).execute();
}
