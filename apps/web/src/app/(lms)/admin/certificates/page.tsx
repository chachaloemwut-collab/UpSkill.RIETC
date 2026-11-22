import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import type { Metadata } from "next";
import { requireAdminPage } from "@/server/programs/admin-page";
import { ADMIN_TABLE_LIMIT, listCertificatesAdmin, listEligibleCoursesForAdmin } from "@/server/admin/certificates.service";
import { CertificatesManager } from "@/components/admin/CertificatesManager";

export const metadata: Metadata = {
  title: "จัดการวุฒิบัตร",
  robots: { index: false },
};

export default async function AdminCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; course?: string }>;
}) {
  await requireAdminPage();
  return <Suspense fallback={<LoadingSkeleton label="กำลังโหลดทะเบียนวุฒิบัตร" />}><CertificateRegister searchParams={searchParams} /></Suspense>;
}

async function CertificateRegister({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; course?: string }>;
}) {
  const sp = await searchParams;

  const [data, courses] = await Promise.all([
    // Search and status are applied in the table (from the URL as its starting state); a course link narrows the load
    listCertificatesAdmin({ courseId: sp.course, all: true }),
    listEligibleCoursesForAdmin(),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <CertificatesManager
        initialData={data}
        courses={courses}
        initialQuery={sp.q ?? ""}
        initialStatus={sp.status ?? ""}
        courseFilter={sp.course ? (courses.find((c) => c.id === sp.course)?.title ?? "หลักสูตรที่เลือก") : null}
        limit={ADMIN_TABLE_LIMIT}
      />
    </div>
  );
}
