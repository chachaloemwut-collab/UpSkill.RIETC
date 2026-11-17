import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, ExternalLink } from "lucide-react";
import { isDeveloperTestEmail } from "@upskill/core";
import { Badge, Card, EmptyState, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { DownloadCertificateButton } from "@/components/course/CertificatePanel";
import { DeveloperTestCertificateButton } from "@/components/certificate/DeveloperTestCertificateButton";
import { formatDateTh } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { learnerOverview } from "@/server/courses/courses.service";

export const metadata: Metadata = { title: "ใบรับรองของฉัน" };

export default async function MyCertificatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isDev = isDeveloperTestEmail(user.email);
  const { enrollments } = await learnerOverview(user.id);
  const certs = enrollments.filter((e) => e.certificate_code);
  const claimable = enrollments.filter((e) => e.status === "completed" && !e.certificate_code);

  return (
    <>
      <PageHeader title="ใบรับรองของฉัน" description="ใบรับรองทุกใบลงนามดิจิทัล ตรวจสอบได้ผ่านหน้าสาธารณะและ QR Code" />
      {isDev && certs.length === 0 && <DeveloperTestCertificateButton />}
      {claimable.length > 0 && (
        <Card className="mb-6 flex flex-wrap items-center gap-3 border-success/30 p-4">
          <Award className="h-5 w-5 text-success" />
          <p className="mr-auto text-sm">
            คุณเรียนจบ <span className="font-medium">{claimable.length}</span> หลักสูตรที่ยังไม่ได้รับใบรับรอง
          </p>
          {claimable.map((e) => (
            <Link key={e.slug} href={`/courses/${e.slug}/certificate`} className={buttonClass("default", "sm")}>
              รับใบรับรอง: {e.title}
            </Link>
          ))}
        </Card>
      )}
      {certs.length === 0 ? (
        <EmptyState icon={<Award className="h-5 w-5" />} title="ยังไม่มีใบรับรอง" description="เรียนให้ครบและสอบผ่านเพื่อรับใบรับรองใบแรกของคุณ" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {certs.map((e, i) => (
            <Card
              key={e.certificate_code}
              className="flex animate-slide-up flex-col overflow-hidden [animation-fill-mode:both]"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="relative flex items-center gap-4 border-b bg-gradient-to-br from-primary/10 via-muted/60 to-background p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Award className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-2 font-semibold leading-snug">{e.title}</p>
                  {e.issued_at && <p className="text-xs text-muted-foreground">ออกเมื่อ {formatDateTh(e.issued_at, "long")}</p>}
                </div>
              </div>
              <div className="grid flex-1 gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs tracking-wider text-muted-foreground">{e.certificate_code}</span>
                  {e.revoked_at ? <Badge variant="destructive">ถูกเพิกถอน</Badge> : <Badge variant="success">ใช้งานได้</Badge>}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  {!e.revoked_at && e.certificate_code && <DownloadCertificateButton code={e.certificate_code} size="sm" />}
                  <Link href={`/verify/${e.certificate_code}`} className={buttonClass("outline", "sm")}>
                    <ExternalLink className="h-3.5 w-3.5" /> หน้าตรวจสอบ
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
