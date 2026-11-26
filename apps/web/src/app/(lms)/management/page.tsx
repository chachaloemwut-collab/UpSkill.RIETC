import {fields as fieldNames} from "@/server/management/labels";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {getCurrentUser} from "@/server/auth/session";
import {ctx} from "@/server/context";
import {duties,resources,deskActions,type Resource} from "@/server/management/catalog";
import {accessibleKeys,records} from "@/server/management/access";
import {filterFor} from "@/server/management/filter";
import {GrantFields} from "./GrantFields";
import {DeskForm} from "./forms";
import {search} from "./actions";

export const metadata={title:"ตารางจัดการงาน",robots:{index:false}};
const value=(v:unknown)=>v instanceof Date?v.toLocaleString("th-TH",{timeZone:"Asia/Bangkok"}):v===true?"ใช่":v===false?"ไม่":String(v??"—");
const field=(s:string)=>fieldNames[s]??s;

function recordLink(key: Resource, field: string, row: Record<string,unknown>) {
  if (field === "user_id" || (key === "users" && field === "username")) return "/admin/users/" + String(row.user_id ?? row.id);
  if (field === "course_id" || (key === "courses" && field === "title")) return "/instructor/courses/" + String(row.course_id ?? row.id);
  if (field === "program_id" || (key === "programs" && field === "title")) return "/admin/programs/" + String(row.program_id ?? row.id);
  if ((field === "cohort_id" && row.cohort_id) || (key === "cohorts" && field === "title")) return "/admin/cohorts/" + String(row.cohort_id ?? row.id);
  if (key === "announcements" && field === "title") return "/admin/announcements/" + String(row.id);
  return null;
}
function RecordCell({item,fieldKey,row,admin}:{item:Resource;fieldKey:string;row:Record<string,unknown>;admin:boolean}) {
  const href = admin && row[fieldKey] != null ? recordLink(item,fieldKey,row) : null;
  return <td data-label={field(fieldKey)} className="p-2">{href ? <Link className="underline" href={href}>{value(row[fieldKey])}</Link> : value(row[fieldKey])}</td>;
}
function Decision({item,row}:{item:Resource;row:Record<string,unknown>}) {
  const version=row.updated_at instanceof Date?row.updated_at.toISOString():String(row.status);
  if (item==="outbox" && !["failed","suppressed"].includes(String(row.status))) return null;
  if (item==="certificates" && row.revoked_at) return null;
  const options: Record<string,string> = item==="payments"
    ? {pending:"รอชำระ",paid:"ชำระแล้ว",waived:"ยกเว้น",not_required:"ไม่มีค่าใช้จ่าย"}
    : item==="certificates" ? {revoke:"เพิกถอนวุฒิบัตรและแจ้งผู้เรียน"}
    : item==="outbox" ? {retry:"ส่งกลับเข้าคิวอีเมล"}
    : item==="announcements" ? (row.is_pinned ? {unpin:"เลิกปักหมุด"} : {pin:"ปักหมุด"})
    : {approve:"อนุมัติ",reject:"ไม่อนุมัติ"};
  return <details><summary>พิจารณารายการ</summary><DeskForm kind="review" label="ยืนยันการบันทึก">
    <input type="hidden" name="resource" value={item}/><input type="hidden" name="id" value={String(row.id)}/>
    <input type="hidden" name="parent" value={String(row.course_id??row.cohort_id)}/><input type="hidden" name="expected" value={version}/>
    <label>ผลการพิจารณา <select name="decision" defaultValue="" required><option value="" disabled>กรุณาเลือก</option>
    {Object.entries(options).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    {item==="payments" && <label>เลขที่ใบเสร็จ <input name="receipt" maxLength={100} defaultValue={String(row.receipt_no??"")}/></label>}
    {item==="certificates" && <input type="hidden" name="code" value={String(row.certificate_code)}/>}
    <label>เหตุผล <input required name="note" maxLength={500}/></label>
  </DeskForm></details>;
}
export default async function ManagementPage({searchParams}:{searchParams:Promise<{resource?:string;page?:string;sort?:string;direction?:string;grants?:string}>}) {
  const actor=await getCurrentUser();
  if (!actor) redirect("/login");
  const [keys,acting,exporting]=await Promise.all([accessibleKeys(actor),accessibleKeys(actor,"act"),accessibleKeys(actor,"export")]);
  const params=await searchParams;
  const key=keys.find(k=>k===(params.resource??keys[0]));
  if (!key) notFound();
  const db=ctx().db;
  const grantPage=Math.max(1,Math.min(1000000,parseInt(params.grants??"1")||1));
  const grants=actor.isSystemOwner?await db.selectFrom("management_grants as g").innerJoin("users as u","u.id","g.user_id").select(["g.id","g.user_id","g.duty","g.course_id","g.cohort_id","g.expires_at","g.revoked_at","g.can_act","g.can_export","u.username"]).orderBy("g.starts_at","desc").orderBy("g.id").limit(26).offset((grantPage-1)*25).execute():[];
  const q=await filterFor(actor,key);
  const page=Math.max(1,Math.min(1000000,parseInt(params.page??"1")||1));
  const sort=params.sort??"";
  const desc=params.direction!=="asc";
  const rows=await records(db,actor,key,{q,page,sort,desc});
  const query=(p:number)=>new URLSearchParams({resource:key,page:String(p),sort,direction:desc?"desc":"asc"}).toString();
  const editable=deskActions.includes(key)&&acting.includes(key);
  return <section className="management-desk mx-auto grid min-w-0 max-w-7xl gap-4">
    <h1 className="text-2xl font-semibold">ตารางจัดการงาน</h1>
    {actor.isSystemOwner && <details className="rounded border p-3"><summary>มอบหมายและถอนสิทธิ์</summary>
      <DeskForm kind="grant" label="มอบสิทธิ์"><GrantFields/>
        <label>หน้าที่ <select name="duty">{Object.entries(duties).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>วันสิ้นสุดตามเวลาไทย <input type="date" name="until"/></label>
        <label><input type="checkbox" name="act"/> พิจารณารายการในหน้าที่</label><label><input type="checkbox" name="export"/> ส่งออกข้อมูล</label>
        <label><input type="checkbox" name="restrictAdmin"/> เมื่อเลือกผู้ดูแลเดิม ให้ใช้เฉพาะสิทธิ์ที่มอบหมาย การถอนสิทธิ์ครั้งสุดท้ายจะคงข้อจำกัดนี้ไว้</label>
        <label>เหตุผล <input name="reason" required maxLength={500}/></label></DeskForm>
      <details><summary>คืนสิทธิ์ผู้ดูแลทั้งระบบ</summary>
        <DeskForm kind="restore" label="คืนสิทธิ์ทั้งระบบ"><label>รหัสบัญชีผู้ดูแล UUID <input required name="target"/></label>
          <label>เหตุผล <input required name="reason" maxLength={500}/></label>
          <label><input required type="checkbox" name="confirmed"/> ยืนยันให้บัญชีนี้เข้าถึงงานผู้ดูแลทุกขอบเขต</label>
        </DeskForm></details>
      <ul>{grants.slice(0,25).map(g=><li className="border-b py-2" key={g.id}>{g.username??g.user_id} · {duties[g.duty as keyof typeof duties]} · {g.course_id??g.cohort_id??"ทุกข้อมูลในหน้าที่"} · {g.can_act?"พิจารณาได้":"อ่าน"} · {g.can_export?"ส่งออกได้":"จำกัดการส่งออก"} · {g.expires_at?value(g.expires_at):"ไม่กำหนดวันสิ้นสุด"} {g.revoked_at?"ถอนสิทธิ์แล้ว":<details><summary>ถอนสิทธิ์</summary><DeskForm kind="revoke" label="ยืนยันถอนสิทธิ์"><input type="hidden" name="id" value={g.id}/><label>เหตุผล <input required name="reason"/></label></DeskForm></details>}</li>)}</ul>
      {grantPage>1&&<Link href={`?grants=${grantPage-1}`}>สิทธิ์หน้าก่อน </Link>}{grants.length>25&&<Link href={`?grants=${grantPage+1}`}>สิทธิ์หน้าถัดไป</Link>}</details>}
    <form className="flex flex-wrap gap-2" method="get"><label>เลือกทะเบียน <select name="resource" defaultValue={key}>{keys.map(k=><option value={k} key={k}>{resources[k].title}</option>)}</select></label><button>เปิดตาราง</button></form>
    <h2 className="text-xl font-semibold">{resources[key].title}</h2>
    <form action={search} className="flex flex-wrap gap-3"><input type="hidden" name="resource" value={key}/><label>ค้นหา <input className="border" name="q" defaultValue={q} maxLength={100}/></label>
      <label>เรียงตาม <select name="sort" defaultValue={sort}>{resources[key].fields.map(f=><option key={f} value={f}>{field(f)}</option>)}</select></label>
      <select aria-label="ทิศทางการเรียง" name="direction" defaultValue={desc?"desc":"asc"}><option value="desc">มากไปน้อย</option><option value="asc">น้อยไปมาก</option></select><button>แสดงผล</button></form>
    {exporting.includes(key) && <a className="underline" href={`/api/management/export?${query(page)}`}>ส่งออก CSV ตามสิทธิ์และตัวกรอง</a>}
    {!rows.length?<p>ไม่พบรายการในขอบเขตและตัวกรองนี้</p>:<div className="overflow-auto"><table className="mobile-records w-full text-left text-sm"><thead><tr>{resources[key].fields.map(f=><th scope="col" className="p-2" key={f}>{field(f)}</th>)}{editable&&<th>ดำเนินการ</th>}</tr></thead><tbody>{rows.slice(0,25).map((row,i)=><tr className="border-t" key={String(row.id??i)}>{resources[key].fields.map(f=><RecordCell key={f} fieldKey={f} row={row} item={key} admin={actor.role==="admin"}/>)}{editable&&<td data-label="ดำเนินการ">{row._can_act===true?<Decision item={key} row={row}/>:"อ่านได้"}</td>}</tr>)}</tbody></table></div>}
    <nav className="flex gap-3">{page>1&&<Link href={`?${query(page-1)}`}>หน้าก่อน</Link>} หน้า {page} {rows.length>25&&<Link href={`?${query(page+1)}`}>หน้าถัดไป</Link>}</nav>
  </section>;
}
