import { notFound,redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { uuidOr404,or404 } from "@/server/programs/admin-page";
import { enrollmentEvidence,applicationPortrait } from "@/server/enrollment-evidence";
import { audit } from "@/server/audit";
import { ctx } from "@/server/context";
import { PrintButton } from "@/components/common/PrintButton";
import { EnrollmentPortrait } from "@/components/account/EnrollmentPortrait";
import { formatDateTimeTh } from "@/lib/format";
import { DEFAULT_ISSUER_TH } from "@upskill/core/certificate-patterns";
import { formatStudyDurationTh } from "@upskill/core";

export default async function EnrollmentDocument({params}:{params:Promise<{id:string;kind:string}>}){
  const user=await getCurrentUser(); if(!user)redirect("/login");
  const {id,kind}=await params;
  if(kind!=="registration"&&kind!=="result")notFound();
  const r=await or404(enrollmentEvidence(user,uuidOr404(id)));
  const result=kind==="result";
  if(result && (r.status!=="completed"||r.revoked_at))notFound();
  const photo=!result && (r.portrait || await applicationPortrait(r.application_id));
  const title=result?"ใบรับรองผลการอบรม":"ใบลงทะเบียนอบรม";
  const name=r.recipient_name_snapshot || r.declaration_name || r.legal_full_name_th || [r.first_name_th,r.last_name_th].filter(Boolean).join(" ") || "ไม่มีชื่อในทะเบียน";
  await audit(ctx().db,{action:"enrollment.document_served",userId:user.id,entityType:"enrollment",entityId:r.id,details:{kind}});
  return <div className="mx-auto grid max-w-3xl gap-4">
    <div className="flex justify-between print:hidden"><Link href={user.role==="admin"?`/admin/users/${r.user_id}`:"/my-courses"}>กลับสู่ทะเบียน</Link><PrintButton label={`พิมพ์${title}`}/></div>
    <article className="space-y-6 rounded-lg border bg-card p-6 sm:p-10 print:border-0">
      <header className="text-center"><p>{DEFAULT_ISSUER_TH}</p><h1 className="mt-2 text-2xl font-semibold">{title}</h1></header>
      {!result && (photo ? <Image unoptimized src={`/api/enrollments/${r.id}/portrait`} width="100" height="132" alt="รูปถ่ายผู้ลงทะเบียน" className="ml-auto h-32 w-24 object-contain"/> : <div className="ml-auto grid h-32 w-24 place-items-center border text-center text-xs">ยังไม่มีรูปถ่าย</div>)}
      <p>{result?"ขอรับรองว่า":"ผู้ลงทะเบียน"} <strong>{name}</strong> {result?"ได้ผ่านการอบรมหลักสูตร":"ได้ลงทะเบียนหลักสูตร"} <strong>{r.course_title_snapshot ?? r.title}</strong></p>
      <dl className="grid gap-2 text-sm"><dt>เลขอ้างอิงการลงทะเบียน</dt><dd>{r.id}</dd>
        <dt>วันลงทะเบียน</dt><dd>{formatDateTimeTh(r.enrolled_at)}</dd>
        {r.application_no && <><dt>เลขใบสมัคร</dt><dd>{r.application_no}</dd></>}
        <dt>สถานะในทะเบียน</dt><dd>{r.status==="completed"?"ผ่านการอบรม":r.status==="revoked"?"ถูกเพิกถอน":"กำลังเรียน"}</dd>
        {result && r.completed_at && <><dt>วันสำเร็จการอบรม</dt><dd>{formatDateTimeTh(r.completed_at)}</dd></>}
        {result && r.certificate_code && <><dt>ผลประเมินและเวลาเรียนตามวุฒิบัตร</dt><dd>{r.quiz_score_snapshot} คะแนน · {formatStudyDurationTh(r.total_actual_study_sec ?? 0)}</dd><dt>ตรวจทะเบียนวุฒิบัตร</dt><dd><Link href={`/verify/${r.certificate_code}`}>{r.certificate_code}</Link></dd></>}
      </dl><p className="text-xs text-muted-foreground">จัดทำจากข้อมูลทะเบียนในระบบ UpskillReskill.RIETC</p>
    </article>
    {!result && !photo && r.user_id===user.id && <EnrollmentPortrait id={r.id}/>}
  </div>;
}
