import { CERTIFICATE_TITLE } from "@upskill/core/certificate-patterns";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { CertificateViewerCard, IssueCertificateButton, LockLegalNameForm } from "@/components/course/CertificatePanel";
import { ctx } from "@/server/context";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";
import { getCertificateDisplay } from "@/server/system-settings.service";
import { formatStudyDurationTh } from "@upskill/core";

export const metadata: Metadata = { title: "วุฒิบัตร" };

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
  // The issued snapshot (not the course's current settings) is what the PDF shows
  const [snap, display] = cert
    ? await Promise.all([
        ctx().db.selectFrom("certificates").selectAll().where("certificate_code", "=", cert.certificate_code).executeTakeFirstOrThrow(),
        getCertificateDisplay(),
      ])
    : [null, null];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href={`/courses/${slug}`} className="truncate transition-colors hover:text-foreground">
              {data.course.title}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" /> วุฒิบัตร
          </span>
        }
        title={CERTIFICATE_TITLE}
        description={data.course.title}
      />
      {cert && snap && display ? (
        <CertificateViewerCard
          code={cert.certificate_code}
          courseTitle={data.course.title}
          revokedAt={cert.revoked_at ? String(cert.revoked_at) : null}
          credentialName={CERTIFICATE_TITLE}
          preview={{
            template: snap.template_snapshot,
            align: snap.text_align_snapshot,
            documentType: snap.document_type_snapshot,
            documentName: snap.document_name_snapshot,
            achievement: snap.achievement_snapshot,
            courseTitle: snap.course_title_snapshot,
            signerName: snap.instructor_name_snapshot,
            signerTitle: snap.signer_title_snapshot,
            display,
            signatureUrl: snap.signature_key_snapshot ? `/api/certificates/${encodeURIComponent(snap.certificate_code)}/signature` : null,
            record: {
              recipientName: snap.recipient_name_snapshot,
              studyText: formatStudyDurationTh(snap.total_actual_study_sec),
              issuedAt: new Date(snap.issued_at).toISOString(),
              expiresAt: snap.expires_at ? new Date(snap.expires_at).toISOString() : null,
              code: snap.certificate_code,
            },
          }}
        />
      ) : !me.legal_name_locked_at ? (
        <LockLegalNameForm defaultTh={me.legal_full_name_th} defaultEn={me.legal_full_name_en} />
      ) : (
        <IssueCertificateButton courseId={data.course.id} nameTh={me.legal_full_name_th} nameEn={me.legal_full_name_en} />
      )}
    </div>
  );
}
