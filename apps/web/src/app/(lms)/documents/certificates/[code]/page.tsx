import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CERTIFICATE_CODE_RE,formatStudyDurationTh } from "@upskill/core";
import { CertificatePreview } from "@/components/certificate/CertificatePreview";
import { DownloadCertificateButton } from "@/components/course/CertificatePanel";
import { getCertificateDisplay } from "@/server/system-settings.service";
import { getCurrentUser } from "@/server/auth/session";
import { ctx } from "@/server/context";
import { audit } from "@/server/audit";

export default async function IssuedDocument({params}:{params:Promise<{code:string}>}){
  const actor=await getCurrentUser();if(!actor)redirect("/login");
  const {code}=await params;if(!CERTIFICATE_CODE_RE.test(code))notFound();
  const c=await ctx().db.selectFrom("certificates").selectAll().where("certificate_code","=",code)
    .$if(actor.role!=="admin",q=>q.where("user_id","=",actor.id)).executeTakeFirst();
  if(!c)notFound();
  await audit(ctx().db,{action:"certificate.document_served",userId:actor.id,entityType:"certificate",entityId:c.id});
  if(c.revoked_at)return <p role="status">วุฒิบัตรฉบับนี้ถูกเพิกถอนแล้ว <Link href={`/verify/${code}`}>ดูสถานะในทะเบียน</Link></p>;
  return <div className="mx-auto grid max-w-5xl gap-4">
    <CertificatePreview template={c.template_snapshot} align={c.text_align_snapshot} documentType={c.document_type_snapshot} documentName={c.document_name_snapshot}
      achievement={c.achievement_snapshot} courseTitle={c.course_title_snapshot} signerName={c.instructor_name_snapshot} signerTitle={c.signer_title_snapshot}
      signatureUrl={c.signature_key_snapshot?`/api/certificates/${code}/signature`:null} display={await getCertificateDisplay()}
      record={{ recipientName:c.recipient_name_snapshot,studyText:formatStudyDurationTh(c.total_actual_study_sec),issuedAt:new Date(c.issued_at).toISOString(),expiresAt:c.expires_at?new Date(c.expires_at).toISOString():null,code }}/>
    <div className="flex flex-wrap items-center gap-4 print:hidden"><DownloadCertificateButton code={code}/><Link href={`/verify/${code}`}>ตรวจสอบสถานะวุฒิบัตร</Link></div>
  </div>;
}
