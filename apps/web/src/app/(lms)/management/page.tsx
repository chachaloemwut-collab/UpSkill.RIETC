import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {getCurrentUser} from "@/server/auth/session";
import {ctx} from "@/server/context";
import {duties,resources,type Resource} from "@/server/management/catalog";
import {accessibleKeys,records} from "@/server/management/access";
import {filterFor} from "@/server/management/filter";
import {DeskForm} from "./forms";
import {search} from "./actions";

export const metadata={title:"ตารางจัดการงาน",robots:{index:false}};
const value=(v:unknown)=>v instanceof Date?v.toLocaleString("th-TH",{timeZone:"Asia/Bangkok"}):v===true?"ใช่":v===false?"ไม่":String(v??"—");
const fieldNames:Record<string,string>={id:"รหัสรายการ",title:"ชื่อ",status:"สถานะ",payment_status:"สถานะชำระเงิน",receipt_no:"เลขที่ใบเสร็จ",user_id:"รหัสสมาชิก",course_id:"รหัสรายวิชา",cohort_id:"รหัสรอบอบรม",application_no:"เลขที่ใบสมัคร",updated_at:"แก้ไขล่าสุด",created_at:"สร้างเมื่อ",applied_at:"สมัครเมื่อ",decided_at:"พิจารณาเมื่อ",username:"ชื่อผู้ใช้",role:"บทบาท",verification_status:"สถานะตรวจสอบ"};
const field=(s:string)=>fieldNames[s]??s;
const controls=["registrations","applications","payments"];
function Decision({item,row}:{item:Resource;row:Record<string,unknown>}) {
  const version=row.updated_at instanceof Date?row.updated_at.toISOString():String(row.status);
  return <details><summary>พิจารณารายการ</summary><DeskForm kind="review" label="ยืนยันการบันทึก">
    <input type="hidden" name="resource" value={item}/><input type="hidden" name="id" value={String(row.id)}/>
    <input type="hidden" name="parent" value={String(row.course_id??row.cohort_id)}/><input type="hidden" name="expected" value={version}/>
    <label>ผลการพิจารณา <select name="decision" defaultValue="" required><option value="" disabled>กรุณาเลือก</option>
    {item==="payments"?Object.entries({pending:"รอชำระ",paid:"ชำระแล้ว",waived:"ยกเว้น",not_required:"ไม่มีค่าใช้จ่าย"}).map(([k,v])=><option key={k} value={k}>{v}</option>):<><option value="approve">อนุมัติ</option><option value="reject">ไม่อนุมัติ</option></>}</select></label>
    {item==="payments" && <label>เลขที่ใบเสร็จ <input name="receipt" maxLength={100} defaultValue={String(row.receipt_no??"")}/></label>}
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
  const editable=controls.includes(key)&&acting.includes(key);
  return <main className="mx-auto grid max-w-7xl gap-4">
    <h1 className="text-2xl font-semibold">ตารางจัดการงาน</h1>
    {actor.isSystemOwner && <details className="rounded border p-3"><summary>มอบหมายและถอนสิทธิ์</summary>
      <DeskForm kind="grant" label="มอบสิทธิ์"><label>รหัสสมาชิก UUID <input name="user" required/></label>
        <label>หน้าที่ <select name="duty">{Object.entries(duties).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>ขอบเขต <select name="kind" defaultValue="course"><option value="course">รายวิชา</option><option value="cohort">รอบอบรม</option><option value="global">ทุกข้อมูลในหน้าที่นี้</option></select></label>
        <label>รหัสรายวิชาหรือรอบ UUID <input name="scope"/></label><label>วันสิ้นสุดตามเวลาไทย <input type="date" name="until"/></label>
        <label><input type="checkbox" name="act"/> พิจารณารายการในหน้าที่</label><label><input type="checkbox" name="export"/> ส่งออกข้อมูล</label>
        <label>เหตุผล <input name="reason" required maxLength={500}/></label></DeskForm>
      <ul>{grants.slice(0,25).map(g=><li className="border-b py-2" key={g.id}>{g.username??g.user_id} · {duties[g.duty as keyof typeof duties]} · {g.course_id??g.cohort_id??"ทุกข้อมูลในหน้าที่"} · {g.can_act?"พิจารณาได้":"อ่าน"} · {g.can_export?"ส่งออกได้":"จำกัดการส่งออก"} · {g.expires_at?value(g.expires_at):"ไม่กำหนดวันสิ้นสุด"} {g.revoked_at?"ถอนสิทธิ์แล้ว":<details><summary>ถอนสิทธิ์</summary><DeskForm kind="revoke" label="ยืนยันถอนสิทธิ์"><input type="hidden" name="id" value={g.id}/><label>เหตุผล <input required name="reason"/></label></DeskForm></details>}</li>)}</ul>
      {grantPage>1&&<Link href={`?grants=${grantPage-1}`}>สิทธิ์หน้าก่อน </Link>}{grants.length>25&&<Link href={`?grants=${grantPage+1}`}>สิทธิ์หน้าถัดไป</Link>}</details>}
    <form className="flex flex-wrap gap-2" method="get"><label>เลือกทะเบียน <select name="resource" defaultValue={key}>{keys.map(k=><option value={k} key={k}>{resources[k].title}</option>)}</select></label><button>เปิดตาราง</button></form>
    <h2 className="text-xl font-semibold">{resources[key].title}</h2>
    <form action={search} className="flex flex-wrap gap-3"><input type="hidden" name="resource" value={key}/><label>ค้นหา <input className="border" name="q" defaultValue={q} maxLength={100}/></label>
      <label>เรียงตาม <select name="sort" defaultValue={sort}>{resources[key].fields.map(f=><option key={f} value={f}>{field(f)}</option>)}</select></label>
      <select aria-label="ทิศทางการเรียง" name="direction" defaultValue={desc?"desc":"asc"}><option value="desc">มากไปน้อย</option><option value="asc">น้อยไปมาก</option></select><button>แสดงผล</button></form>
    {exporting.includes(key) && <a className="underline" href={`/api/management/export?${query(page)}`}>ส่งออก CSV ตามสิทธิ์และตัวกรอง</a>}
    {!rows.length?<p>ไม่พบรายการในขอบเขตและตัวกรองนี้</p>:<div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{resources[key].fields.map(f=><th scope="col" className="p-2" key={f}>{field(f)}</th>)}{editable&&<th>ดำเนินการ</th>}</tr></thead><tbody>{rows.slice(0,25).map((row,i)=><tr className="border-t" key={String(row.id??i)}>{resources[key].fields.map(f=><td className="p-2" key={f}>{value(row[f])}</td>)}{editable&&<td><Decision item={key} row={row}/></td>}</tr>)}</tbody></table></div>}
    <nav className="flex gap-3">{page>1&&<Link href={`?${query(page-1)}`}>หน้าก่อน</Link>} หน้า {page} {rows.length>25&&<Link href={`?${query(page+1)}`}>หน้าถัดไป</Link>}</nav>
  </main>;
}
