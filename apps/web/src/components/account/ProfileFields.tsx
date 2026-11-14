"use client";
import Link from "next/link";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ADULT_AGE, THAI_PROVINCES, TITLES_EN, TITLES_TH, ageOn, type ProfileErrors, type ProfileInput } from "@upskill/core/profile";
import { Checkbox, Field, Input, Select } from "@/components/ui";

export type ProfileDefaults = Partial<Record<keyof ProfileInput, string>> & { nationalIdMasked?: string | null };

/** Reads the profile fields of a form rendered with <ProfileFields /> */
export function readProfile(f: FormData): ProfileInput {
  const s = (k: string) => String(f.get(k) ?? "");
  return {
    titleTh: s("titleTh"),
    firstNameTh: s("firstNameTh"),
    lastNameTh: s("lastNameTh"),
    titleEn: s("titleEn"),
    firstNameEn: s("firstNameEn"),
    lastNameEn: s("lastNameEn"),
    phone: s("phone"),
    birthDate: s("birthDate"),
    nationalId: s("nationalId"),
    addressLine: s("addressLine"),
    subdistrict: s("subdistrict"),
    district: s("district"),
    province: s("province"),
    postalCode: s("postalCode"),
    guardianName: s("guardianName") || null,
    guardianPhone: s("guardianPhone") || null,
    guardianConsent: f.get("guardianConsent") === "on",
  };
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {description && <p className="-mt-2 text-xs text-muted-foreground">{description}</p>}
      {children}
    </fieldset>
  );
}

const titleOptions = (xs: readonly string[]) => xs.map((t) => ({ value: t, label: t }));

/** Every member-profile input, grouped as on a Thai registration form. Errors come from validateProfile (core). */
export function ProfileFields({ defaults = {}, errors = {}, namesLocked = false }: { defaults?: ProfileDefaults; errors?: ProfileErrors; namesLocked?: boolean }) {
  const [birthDate, setBirthDate] = useState(defaults.birthDate ?? "");
  const minor = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && ageOn(birthDate, new Date()) < ADULT_AGE;
  const hasId = !!defaults.nationalIdMasked;
  const nameHint = namesLocked ? "ล็อกแล้วเพราะใช้พิมพ์บนใบรับรอง หากผิดกรุณาติดต่อผู้ดูแลระบบ" : undefined;
  return (
    <div className="grid gap-4">
      <Section title="ชื่อ-นามสกุล ภาษาไทย" description="ตามบัตรประจำตัวประชาชน ใช้พิมพ์บนใบรับรอง">
        <div className="grid gap-3 sm:grid-cols-[150px_1fr_1fr]">
          <Field label="คำนำหน้า" error={errors.titleTh}>
            {namesLocked ? <Input name="titleTh" defaultValue={defaults.titleTh} readOnly /> : <Select name="titleTh" defaultValue={defaults.titleTh} options={titleOptions(TITLES_TH)} creatable placeholder="เลือก…" />}
          </Field>
          <Field label="ชื่อ" error={errors.firstNameTh} hint={nameHint}><Input name="firstNameTh" defaultValue={defaults.firstNameTh} maxLength={100} required readOnly={namesLocked} autoComplete="off" /></Field>
          <Field label="นามสกุล" error={errors.lastNameTh}><Input name="lastNameTh" defaultValue={defaults.lastNameTh} maxLength={100} required readOnly={namesLocked} autoComplete="off" /></Field>
        </div>
      </Section>
      <Section title="ชื่อ-นามสกุล ภาษาอังกฤษ">
        <div className="grid gap-3 sm:grid-cols-[150px_1fr_1fr]">
          <Field label="Title" error={errors.titleEn}>
            {namesLocked ? <Input name="titleEn" defaultValue={defaults.titleEn} readOnly /> : <Select name="titleEn" defaultValue={defaults.titleEn} options={titleOptions(TITLES_EN)} creatable placeholder="Select…" />}
          </Field>
          <Field label="First name" error={errors.firstNameEn}><Input name="firstNameEn" defaultValue={defaults.firstNameEn} maxLength={100} required readOnly={namesLocked} autoComplete="given-name" /></Field>
          <Field label="Last name" error={errors.lastNameEn}><Input name="lastNameEn" defaultValue={defaults.lastNameEn} maxLength={100} required readOnly={namesLocked} autoComplete="family-name" /></Field>
        </div>
      </Section>
      <Section title="ข้อมูลยืนยันตัวตนและการติดต่อ">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="เลขประจำตัวประชาชน"
            error={errors.nationalId}
            hint={hasId ? "บันทึกแล้ว แก้ไขไม่ได้" : "13 หลัก ใช้ตรวจว่าหนึ่งคนมีบัญชีเดียว ระบบเก็บแบบเข้ารหัส"}
          >
            {hasId ? (
              <Input value={defaults.nationalIdMasked ?? ""} readOnly className="font-mono" aria-label="เลขประจำตัวประชาชน (ซ่อนบางส่วน)" />
            ) : (
              <Input name="nationalId" inputMode="numeric" maxLength={17} required placeholder="x-xxxx-xxxxx-xx-x" autoComplete="off" className="font-mono" />
            )}
          </Field>
          <Field label="วันเกิด" error={errors.birthDate}>
            <Input name="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.currentTarget.value)} required max={new Date().toISOString().slice(0, 10)} autoComplete="bday" />
          </Field>
          <Field label="เบอร์โทรศัพท์มือถือ" error={errors.phone}><Input name="phone" type="tel" inputMode="tel" defaultValue={defaults.phone} maxLength={20} required placeholder="08x-xxx-xxxx" autoComplete="tel" /></Field>
        </div>
      </Section>
      <Section title="ที่อยู่ที่ติดต่อได้">
        <Field label="บ้านเลขที่ หมู่ ซอย ถนน" error={errors.addressLine}><Input name="addressLine" defaultValue={defaults.addressLine} maxLength={255} required autoComplete="street-address" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ตำบล/แขวง" error={errors.subdistrict}><Input name="subdistrict" defaultValue={defaults.subdistrict} maxLength={100} required /></Field>
          <Field label="อำเภอ/เขต" error={errors.district}><Input name="district" defaultValue={defaults.district} maxLength={100} required /></Field>
          <Field label="จังหวัด" error={errors.province}>
            <Select name="province" defaultValue={defaults.province} placeholder="เลือกจังหวัด…" options={THAI_PROVINCES.map((p) => ({ value: p, label: p }))} />
          </Field>
          <Field label="รหัสไปรษณีย์" error={errors.postalCode}><Input name="postalCode" inputMode="numeric" defaultValue={defaults.postalCode} maxLength={5} required autoComplete="postal-code" /></Field>
        </div>
      </Section>
      {minor && (
        <Section title="ผู้ปกครอง" description={`ผู้สมัครอายุต่ำกว่า ${ADULT_AGE} ปี ต้องได้รับความยินยอมจากผู้ปกครองตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อ-นามสกุลผู้ปกครอง" error={errors.guardianName}><Input name="guardianName" defaultValue={defaults.guardianName} maxLength={255} required /></Field>
            <Field label="เบอร์โทรศัพท์ผู้ปกครอง" error={errors.guardianPhone}><Input name="guardianPhone" type="tel" defaultValue={defaults.guardianPhone} maxLength={20} required /></Field>
          </div>
          <div>
            <Checkbox name="guardianConsent" defaultChecked={!!defaults.guardianName} label="ผู้ปกครองรับทราบประกาศความเป็นส่วนตัวและให้ความยินยอมในการสมัครครั้งนี้" />
            {errors.guardianConsent && <p className="mt-1 text-xs text-destructive">{errors.guardianConsent}</p>}
          </div>
        </Section>
      )}
    </div>
  );
}

/** PDPA notice summary shown where the data is collected, with the full notice one click away */
export function PdpaNotice({ consentName = "pdpaConsent", error }: { consentName?: string; error?: string | undefined }) {
  return (
    <div className="grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> การคุ้มครองข้อมูลส่วนบุคคล (PDPA)</p>
      <p className="text-muted-foreground">
        ระบบนี้ดำเนินการภายใต้พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) ข้อมูลที่กรอกใช้เพื่อยืนยันตัวตน ตรวจสอบว่าหนึ่งคนมีบัญชีเดียว
        ติดต่อเรื่องการอบรม และออกใบรับรองเท่านั้น เลขประจำตัวประชาชนถูกเข้ารหัสก่อนจัดเก็บ และไม่แสดงต่อผู้อื่น
        คุณขอเข้าถึง แก้ไข หรือขอลบข้อมูลได้ตามสิทธิของเจ้าของข้อมูล
      </p>
      <Link href="/privacy" target="_blank" className="w-fit font-medium text-primary underline-offset-4 hover:underline">อ่านประกาศความเป็นส่วนตัวฉบับเต็ม</Link>
      <div>
        <Checkbox name={consentName} required label="ข้าพเจ้าได้อ่านและรับทราบประกาศความเป็นส่วนตัว และยินยอมให้เก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลตามวัตถุประสงค์ที่ระบุ" />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
