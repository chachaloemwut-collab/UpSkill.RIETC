import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationSheet } from "@/components/account/ApplicationSheet";
import { PrintButton } from "@/components/common/PrintButton";
import { buttonClass } from "@/components/ui";
import { ctx } from "@/server/context";
import { getCurrentUser } from "@/server/auth/session";
import { getMyProfile } from "@/server/auth/profile.service";

export const metadata: Metadata = { title: "ใบสมัครเรียน", robots: { index: false } };

/** The applicant's own application, printable at any time after signing up */
export default async function MyApplicationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { profile } = await getMyProfile(user.id);
  if (!profile) redirect("/me/profile");
  const u = await ctx().db.selectFrom("users").select(["email", "created_at"]).where("id", "=", user.id).executeTakeFirstOrThrow();
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/me/profile" className={buttonClass("ghost", "md")}>← ข้อมูลผู้เรียน</Link>
        <PrintButton label="พิมพ์ใบสมัคร" />
      </div>
      <ApplicationSheet
        data={{
          email: u.email,
          titleTh: profile.title_th, firstNameTh: profile.first_name_th, lastNameTh: profile.last_name_th,
          titleEn: profile.title_en, firstNameEn: profile.first_name_en, lastNameEn: profile.last_name_en,
          birthDate: profile.birth_date ?? "", nationalIdLast4: profile.national_id_last4 ?? "", phone: profile.phone,
          addressLine: profile.address_line, subdistrict: profile.subdistrict, district: profile.district, province: profile.province, postalCode: profile.postal_code,
          guardianName: profile.guardian_name,
          submittedAt: profile.pdpa_consented_at ?? u.created_at,
        }}
      />
    </div>
  );
}
