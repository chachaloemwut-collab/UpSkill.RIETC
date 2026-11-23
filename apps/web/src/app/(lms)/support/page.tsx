import Link from "next/link";
import {redirect} from "next/navigation";
import {sql} from "@upskill/db";
import {getCurrentUser} from "@/server/auth/session";
import {ctx} from "@/server/context";
import {uuidOr404,or404} from "@/server/programs/admin-page";
import {messages,supportMember} from "@/server/support";
import {SupportConversation} from "@/components/account/SupportConversation";
import {PageHeader} from "@/components/common/PageHeader";
import {formatDateTimeTh} from "@/lib/format";
export default async function Support({searchParams}:{searchParams:Promise<{member?:string;page?:string}>}){
  const actor=await getCurrentUser();if(!actor)redirect("/login");
  const sp=await searchParams;
  const id=sp.member?uuidOr404(sp.member):actor.id;
  const member=await or404(supportMember(actor,id));
  const page=Math.max(1,Math.min(100000,Number.parseInt(sp.page??"1",10)||1));
  const [initial,inbox]=await Promise.all([messages(actor,id),actor.role==="admin"?ctx().db.selectFrom("support_messages as m").innerJoin("users as u","u.id","m.member_id")
    .select(["u.id","u.email","u.legal_full_name_th",sql<Date>`max(m.created_at)`.as("latest")]).groupBy(["u.id","u.email","u.legal_full_name_th"]).orderBy("latest","desc").orderBy("u.id").offset((page-1)*30).limit(31).execute():[]]);
  return <div className="mx-auto grid max-w-4xl gap-4"><PageHeader title="แจ้งปัญหาและติดต่อผู้ดูแล" description="สนทนาส่วนตัวกับผู้ดูแลระบบ"/>
    {actor.role==="admin"&&<section><h2>บทสนทนาของสมาชิก</h2><ul className="divide-y">{inbox.slice(0,30).map(m=><li key={m.id}><Link className="flex justify-between py-2" href={`/support?member=${m.id}&page=${page}`}>{m.legal_full_name_th||m.email}<span>{formatDateTimeTh(m.latest)}</span></Link></li>)}</ul>
    <nav className="flex gap-4">{page>1&&<Link href={`/support?page=${page-1}`}>ก่อนหน้า</Link>}{inbox.length>30&&<Link href={`/support?page=${page+1}`}>ถัดไป</Link>}</nav></section>}
    <h2>{member.id===actor.id?"บทสนทนาของฉัน":member.legal_full_name_th||member.email}</h2><SupportConversation key={member.id} member={member.id} initial={initial}/></div>;
}
