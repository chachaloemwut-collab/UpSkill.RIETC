import type { Metadata } from "next";
import { PageHeader } from "@/components/common/PageHeader";
import { requireAdminPage } from "@/server/programs/admin-page";
import { listCertificatesAdmin, listEligibleCoursesForAdmin, type AdminCertificateStatus } from "@/server/admin/certificates.service";
import { CertificatesManager } from "@/components/admin/CertificatesManager";

export const metadata: Metadata = {
  title: "จัดการวุฒิบัตร",
  robots: { index: false },
};

export default async function AdminCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; course?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;

  const [data, courses] = await Promise.all([
    listCertificatesAdmin({
      query: sp.q,
      status: sp.status as AdminCertificateStatus | undefined,
      courseId: sp.course,
      page: Number(sp.page ?? 1),
    }),
    listEligibleCoursesForAdmin(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="จัดการวุฒิบัตร"
        description={`วุฒิบัตรทั้งหมดในระบบ ${data.counts.total} ฉบับ · ค้นหา ตรวจสอบความถูกต้อง เพิกถอน หรือออกวุฒิบัตรเป็นกรณีพิเศษ`}
      />

      <CertificatesManager
        initialData={data}
        courses={courses}
        searchQuery={sp.q ?? ""}
        activeStatus={sp.status ?? ""}
        activeCourse={sp.course ?? ""}
      />
    </div>
  );
}
