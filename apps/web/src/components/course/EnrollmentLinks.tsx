import Link from "next/link";
export function EnrollmentLinks({id,code,completed}:{id:string;code?:string|null;completed:boolean}){
  return <nav aria-label="เอกสารการลงทะเบียน" className="flex flex-wrap gap-x-4 gap-y-2 py-2 text-sm text-primary underline">
    <Link prefetch={false} href={`/enrollments/${id}/registration`}>ใบลงทะเบียน</Link>
    {completed && <Link prefetch={false} href={`/enrollments/${id}/result`}>ใบรับรองผลการอบรม</Link>}
    {code && <Link prefetch={false} href={`/documents/certificates/${code}`}>เปิดวุฒิบัตร</Link>}
  </nav>;
}
