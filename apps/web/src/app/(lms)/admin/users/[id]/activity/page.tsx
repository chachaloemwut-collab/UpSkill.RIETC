import Link from "next/link";
import {notFound} from "next/navigation";
import {ctx} from "@/server/context";
import {requireAdminPage,uuidOr404} from "@/server/programs/admin-page";
import {formatDateTimeTh} from "@/lib/format";
export default async function Activity({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{before?:string;group?:string}>}){
  await requireAdminPage();
  const id=uuidOr404((await params).id),sp=await searchParams;
  const member=await ctx().db.selectFrom("users").select(["id","email","legal_full_name_th"]).where("id","=",id).executeTakeFirst();
  if(!member)notFound();
  const groups=["activity.page","activity.request","auth.login","enrollment.document_served","certificate.document_served","support.message_sent"];
  let q=ctx().db.selectFrom("audit_logs").select(["id","created_at","action","details","entity_id"]).where("user_id","=",id);
  if(sp.group&&groups.includes(sp.group))q=q.where("action","=",sp.group);
  if(sp.before&&/^\d{1,18}$/.test(sp.before))q=q.where("id","<",sp.before);
  const rows=await q.orderBy("id","desc").limit(51).execute();
  return <section className="mx-auto grid max-w-4xl gap-4"><h1 className="text-2xl font-semibold">ประวัติการใช้งานของ {member.legal_full_name_th||member.email}</h1>
    <form className="flex flex-wrap gap-3"><label>ประเภทเหตุการณ์ <select name="group" defaultValue={sp.group}><option value="">ทั้งหมด</option>{groups.map((g,i)=><option key={g} value={g}>{["เปิดหน้าหรือเรียกพิมพ์","คำขอระบบ","เข้าสู่ระบบ","เปิดเอกสารลงทะเบียนหรือผล","เปิดวุฒิบัตร","ส่งข้อความ"][i]}</option>)}</select></label><button>กรองรายการ</button></form>
    <ul className="divide-y">{rows.slice(0,50).map(r=>{const d=r.details && typeof r.details==="object" && !Array.isArray(r.details)?r.details:{};return <li key={String(r.id)} className="py-3"><time>{formatDateTimeTh(r.created_at)}</time> · {r.action}<p className="break-all text-sm">{[d.event,d.screen,d.method,d.endpoint,d.status,d.kind,r.entity_id].filter(x=>typeof x==="string"||typeof x==="number").join(" · ")}</p></li>;})}</ul>
    {!rows.length&&<p>ไม่มีรายการตามเงื่อนไข</p>}{rows.length>50&&<Link href={`?before=${rows[49]!.id}&group=${encodeURIComponent(sp.group??"")}`}>ดูรายการก่อนหน้า</Link>}</section>;
}
