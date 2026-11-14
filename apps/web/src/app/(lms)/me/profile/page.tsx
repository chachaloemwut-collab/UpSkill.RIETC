import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Alert, Card } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { ProfileForm } from "@/components/account/ProfileForm";
import { getCurrentUser } from "@/server/auth/session";
import { getMyProfile } from "@/server/auth/profile.service";

export const metadata: Metadata = { title: "ข้อมูลผู้เรียน", robots: { index: false } };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { welcome } = await searchParams;
  const { profile, namesLocked } = await getMyProfile(user.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Link href="/me" className="hover:text-foreground">ตั้งค่าบัญชี</Link><ChevronRight className="h-3.5 w-3.5" /> ข้อมูลผู้เรียน</span>}
        title="ข้อมูลผู้เรียน"
        description="ชื่อ-นามสกุล ข้อมูลยืนยันตัวตน และที่อยู่ติดต่อ ใช้สำหรับลงทะเบียนเรียน สมัครรอบอบรม และออกใบรับรอง"
      />
      {!profile && (
        <div className="mb-4">
          <Alert variant="warning" title={welcome ? "ยินดีต้อนรับ กรุณากรอกข้อมูลผู้เรียนให้ครบ" : "ยังไม่ได้กรอกข้อมูลผู้เรียน"}>
            ต้องกรอกข้อมูลให้ครบก่อนลงทะเบียนเรียนหรือสมัครรอบอบรม
          </Alert>
        </div>
      )}
      <Card className="p-5">
        <ProfileForm
          exists={!!profile}
          namesLocked={namesLocked}
          defaults={
            profile
              ? {
                  titleTh: profile.title_th,
                  firstNameTh: profile.first_name_th,
                  lastNameTh: profile.last_name_th,
                  titleEn: profile.title_en,
                  firstNameEn: profile.first_name_en,
                  lastNameEn: profile.last_name_en,
                  phone: profile.phone,
                  birthDate: profile.birth_date,
                  addressLine: profile.address_line,
                  subdistrict: profile.subdistrict,
                  district: profile.district,
                  province: profile.province,
                  postalCode: profile.postal_code,
                  guardianName: profile.guardian_name ?? undefined,
                  guardianPhone: profile.guardian_phone ?? undefined,
                  nationalIdMasked: profile.national_id_masked,
                }
              : {}
          }
        />
      </Card>
    </div>
  );
}
