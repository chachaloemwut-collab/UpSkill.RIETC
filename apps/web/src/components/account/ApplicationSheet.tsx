// Printable application ("ใบสมัคร") for the account itself: what the applicant filled in when signing up.
// Server-safe (no hooks): rendered after sign-up in the browser and on /me/application from the database.
import { ELECTRONIC_SIGNATURE_STATEMENT, GUARDIAN_CONSENT_TEXT, maskNationalId } from "@upskill/core/profile";
import { DEFAULT_ISSUER_TH } from "@upskill/core/certificate-patterns";
import { formatDateTh, formatDateTimeTh } from "@/lib/format";

export interface ApplicationSheetData {
  email: string;
  titleTh: string;
  firstNameTh: string;
  lastNameTh: string;
  titleEn: string;
  firstNameEn: string;
  lastNameEn: string;
  birthDate: string;
  /** last 4 digits only: the full number is never printed */
  nationalIdLast4: string;
  phone: string;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  guardianName: string | null;
  submittedAt: Date | string;
}

const PDPA_TEXT = "ข้าพเจ้าได้อ่านและรับทราบประกาศความเป็นส่วนตัว และยินยอมให้เก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลตามวัตถุประสงค์ที่ระบุ";

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[11rem_minmax(0,1fr)] gap-3 border-b border-dotted border-foreground/25 py-1.5 text-sm print:border-black/40">
      <span className="text-muted-foreground print:text-black/70">{label}</span>
      <span className="font-medium">{value || "-"}</span>
    </div>
  );
}

export function ApplicationSheet({ data }: { data: ApplicationSheetData }) {
  const id = data.nationalIdLast4 ? maskNationalId(data.nationalIdLast4) : "-";
  const signer = `${data.titleTh}${data.firstNameTh} ${data.lastNameTh}`;
  return (
    <article className="application-sheet mx-auto grid w-full max-w-[760px] gap-5 rounded-lg border bg-white p-6 text-black sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0">
      <div className="grid gap-1 text-center">
        <p className="text-sm">{DEFAULT_ISSUER_TH}</p>
        <h1 className="text-xl font-bold">ใบสมัครเรียนหลักสูตรวิชาชีพระยะสั้น</h1>
        <p className="text-xs text-black/60">สมัครผ่านระบบออนไลน์ UpskillReskill.RIETC</p>
      </div>

      <section className="grid">
        <h2 className="mb-1 text-sm font-semibold">ข้อมูลผู้สมัคร</h2>
        <Line label="ชื่อ-นามสกุล" value={signer} />
        <Line label="Name" value={`${data.titleEn} ${data.firstNameEn} ${data.lastNameEn}`} />
        <Line label="วันเดือนปีเกิด" value={data.birthDate ? formatDateTh(data.birthDate, "long") : ""} />
        <Line label="เลขประจำตัวประชาชน" value={id} />
        <Line label="เบอร์โทรศัพท์มือถือ" value={data.phone} />
        <Line label="อีเมล" value={data.email} />
        <Line label="ที่อยู่" value={[data.addressLine, `ต.${data.subdistrict}`, `อ.${data.district}`, `จ.${data.province}`, data.postalCode].join(" ")} />
      </section>

      {data.guardianName && (
        <section className="grid">
          <h2 className="mb-1 text-sm font-semibold">ความยินยอมของผู้ปกครอง</h2>
          <Line label="ชื่อ-นามสกุลผู้ปกครอง" value={data.guardianName} />
          <p className="mt-2 text-sm">☑ {GUARDIAN_CONSENT_TEXT}</p>
        </section>
      )}

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">การรับรองและความยินยอม</h2>
        <p className="text-sm">☑ {PDPA_TEXT}</p>
        <p className="rounded-md border border-black/30 p-3 text-sm leading-relaxed">{ELECTRONIC_SIGNATURE_STATEMENT}</p>
      </section>

      <section className="grid justify-items-end gap-1 pt-2 text-sm">
        <p>ลงชื่อ (อิเล็กทรอนิกส์) <span className="font-semibold">{signer}</span> ผู้สมัคร</p>
        <p className="text-black/70">วันที่สมัคร {formatDateTimeTh(data.submittedAt)}</p>
      </section>
    </article>
  );
}
