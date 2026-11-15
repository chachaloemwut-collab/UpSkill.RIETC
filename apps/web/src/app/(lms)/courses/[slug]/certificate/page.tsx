import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { CertificateViewerCard, IssueCertificateButton, LockLegalNameForm } from "@/components/course/CertificatePanel";
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
  const recipientName = me.legal_full_name_th || me.legal_full_name_en || user.username || user.email;

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
        <CertificateViewerCard
          code={cert.certificate_code}
          courseTitle={data.course.title}
          recipientName={recipientName}
          revokedAt={cert.revoked_at ? String(cert.revoked_at) : null}
          credentialName={data.course.credential_name_th}
        />
      ) : !me.legal_name_locked_at ? (
        <LockLegalNameForm defaultTh={me.legal_full_name_th} defaultEn={me.legal_full_name_en} />
      ) : (
        <IssueCertificateButton courseId={data.course.id} nameTh={me.legal_full_name_th} nameEn={me.legal_full_name_en} />
      )}
    </div>
  );
}
