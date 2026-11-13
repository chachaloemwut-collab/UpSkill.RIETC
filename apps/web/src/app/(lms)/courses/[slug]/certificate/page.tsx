import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert, Card, PageTitle } from "@/components/ui";
import { DownloadCertificateButton, IssueCertificateButton, LockLegalNameForm } from "@/components/course/CertificatePanel";
import { ctx } from "@/server/context";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";

export const metadata: Metadata = { title: "ใบรับรอง" };

export default async function CertificatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await getCourseForViewer(slug, user);
  if (!data) notFound();
  if (data.enrollment?.status !== "completed") redirect(`/courses/${slug}`);

  const me = await ctx()
    .db.selectFrom("users")
    .select(["legal_full_name_th", "legal_full_name_en", "legal_name_locked_at"])
    .where("id", "=", user.id)
    .executeTakeFirstOrThrow();

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <PageTitle sub={data.course.title}>ใบรับรอง</PageTitle>
      {data.certificate ? (
        <Card className="space-y-4">
          {data.certificate.revoked_at ? (
            <Alert tone="error">ใบรับรองนี้ถูกเพิกถอนแล้ว</Alert>
          ) : (
            <Alert tone="success">ออกใบรับรองแล้ว รหัส {data.certificate.certificate_code}</Alert>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {!data.certificate.revoked_at && <DownloadCertificateButton code={data.certificate.certificate_code} />}
            <Link href={`/verify/${data.certificate.certificate_code}`} className="text-sm text-green-700 underline">
              หน้าตรวจสอบสาธารณะ
            </Link>
          </div>
        </Card>
      ) : !me.legal_name_locked_at ? (
        <LockLegalNameForm />
      ) : (
        <IssueCertificateButton courseId={data.course.id} hasTh={!!me.legal_full_name_th} hasEn={!!me.legal_full_name_en} />
      )}
    </main>
  );
}
