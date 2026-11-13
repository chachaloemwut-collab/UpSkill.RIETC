import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Award, ChevronRight, ExternalLink } from "lucide-react";
import { Alert, Card, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
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
  const cert = data.certificate;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href={`/courses/${slug}`} className="truncate transition-colors hover:text-foreground">
              {data.course.title}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" /> ใบรับรอง
          </span>
        }
        title={data.course.credential_name_th}
        description={data.course.title}
      />
      {cert ? (
        <Card className="overflow-hidden">
          <div className="relative flex flex-col items-center gap-3 bg-gradient-to-br from-primary/10 via-muted to-background px-6 py-10 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <Award className="h-8 w-8" />
            </span>
            <p className="text-sm text-muted-foreground">รหัสใบรับรอง</p>
            <p className="font-mono text-lg font-semibold tracking-wider">{cert.certificate_code}</p>
          </div>
          <div className="grid gap-4 p-6">
            {cert.revoked_at ? (
              <Alert variant="destructive" title="ใบรับรองนี้ถูกเพิกถอนแล้ว" />
            ) : (
              <Alert variant="success" title="ออกใบรับรองแล้ว">ดาวน์โหลดไฟล์ PDF หรือแชร์ลิงก์หน้าตรวจสอบสาธารณะได้</Alert>
            )}
            <div className="flex flex-wrap items-start gap-2">
              {!cert.revoked_at && <DownloadCertificateButton code={cert.certificate_code} />}
              <Link href={`/verify/${cert.certificate_code}`} className={buttonClass("outline")}>
                <ExternalLink className="h-4 w-4" /> หน้าตรวจสอบสาธารณะ
              </Link>
            </div>
          </div>
        </Card>
      ) : !me.legal_name_locked_at ? (
        <LockLegalNameForm />
      ) : (
        <IssueCertificateButton courseId={data.course.id} nameTh={me.legal_full_name_th} nameEn={me.legal_full_name_en} />
      )}
    </div>
  );
}
