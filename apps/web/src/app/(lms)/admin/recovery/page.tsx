import { duties, dutyOf } from "@/server/admin/recovery-review";
import { approve, delegate, verify } from "./review-actions";
import { IssueLink } from "./issue";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { decryptSettingSecret } from "@upskill/infra/secret-box";
import { Button } from "@/components/ui";
import { categories, states } from "@/lib/recovery";
import { ctx } from "@/server/context";
import { requireAdminPage } from "@/server/programs/admin-page";

const moves: Record<string,string[]> = { open: ["review"], review: ["waiting","declined"], waiting: ["review","declined"], recovered: ["resolved"], issued: ["cancelled"], approved: ["cancelled"], approval: ["declined"] };

async function update(form: FormData) {
  "use server";
  const actor = await requireAdminPage();
  if (await dutyOf(actor) === "auditor") redirect("/admin/recovery");
  const id = z.uuid().parse(form.get("id"));
  const next = z.enum(["review","waiting","resolved","declined","cancelled"]).parse(form.get("next"));
  const previous = String(form.get("previous"));
  const changed = await ctx().db.transaction().execute(async trx => {
    const row = await trx.selectFrom("recovery_cases").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
    if (!row || row.status !== previous || !moves[row.status]?.includes(next) || (row.assignee_id && row.assignee_id !== actor.id)) return false;
    if (next === "cancelled") await trx.updateTable("password_reset_tokens").set({used_at:new Date()}).where("recovery_case_id","=",id).where("used_at","is",null).execute();
    await trx.updateTable("recovery_cases").set({status: next, assignee_id: actor.id, updated_at: new Date()}).where("id","=",id).execute();
    await trx.insertInto("recovery_case_events").values({case_id: id, actor_id: actor.id, status: next, note: ""}).execute();
    return true;
  });
  revalidatePath("/admin/recovery");
  if (!changed) redirect("/admin/recovery?conflict=1");
}

export default async function RecoveryQueue({searchParams}: {searchParams: Promise<{page?: string; reference?:string; conflict?: string}>}) {
  const actor = await requireAdminPage();
  const duty = await dutyOf(actor);
  const {db,env} = ctx();
  const params = await searchParams;
  const page = Math.min(1000000,Math.max(1,Number.parseInt(params.page ?? "",10) || 1));
  const rows = await db.selectFrom("recovery_cases").select(["id","category","status","assignee_id","contact","created_at","target_user_id","reviewed_by","issued_until","approved_by","proof_method","record_comparison","related_user_id"])
    .$if(!!params.reference,q=>q.where("id","=",z.uuid().safeParse(params.reference).success ? params.reference! : "00000000-0000-0000-0000-000000000000"))
    .orderBy("created_at","desc").orderBy("id","desc").limit(26).offset((page-1)*25).execute();
  const ids = rows.slice(0,25).map(r => r.id);
  const events = ids.length ? await db.selectFrom("recovery_case_events as e").innerJoin("users as u","u.id","e.actor_id")
    .select(["e.case_id","e.status","e.created_at","u.username"]).where("e.case_id","in",ids).orderBy("e.created_at").execute() : [];
  return <main className="mx-auto grid max-w-3xl gap-4"><h1 className="text-2xl font-semibold">เรื่องขอกู้บัญชีผู้เรียน</h1>
    <p>รับเรื่องก่อนเปิดข้อมูลติดต่อ ตรวจสอบตัวตนตามขั้นตอนของงานทะเบียนก่อนใช้เครื่องมือกู้บัญชี</p>
    <form action="/admin/recovery"><label>ค้นหาด้วยเลขเรื่อง <input name="reference" defaultValue={params.reference}/></label><Button type="submit">ค้นหาเรื่อง</Button></form>
    <Link className="underline" href="/admin/users">ค้นหาบัญชีผู้เรียนเดิม</Link>
    {actor.isSystemOwner && <details><summary>มอบหมายหน้าที่กู้บัญชี</summary><form action={delegate} className="grid gap-2">
      <label>รหัสบัญชี UUID ของผู้ดูแล <input name="target" required /></label><label>หน้าที่ <select name="duty">{Object.entries(duties).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><Button type="submit">บันทึกหน้าที่</Button>
    </form></details>}
    {params.conflict && <p role="alert">สถานะเรื่องเปลี่ยนแล้ว กรุณาตรวจสอบผู้รับผิดชอบและสถานะล่าสุด</p>}
    {rows.length === 0 && <p>ไม่มีเรื่องในหน้านี้</p>}
    {rows.slice(0,25).map(row => <article className="grid gap-2 rounded border p-4" key={row.id}>
      <h2 className="font-semibold">{categories[row.category as keyof typeof categories]}</h2>
      <p>เลขเรื่อง {row.id}</p><p>{states[row.status]} · {row.created_at.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p>
      {(row.assignee_id === actor.id || duty === "registrar" || duty === "owner") && duty !== "auditor" && <p>ช่องทางติดต่อ {decryptSettingSecret(row.contact,env.SETTINGS_ENCRYPTION_KEY)}</p>}
      {row.assignee_id && row.assignee_id !== actor.id && <p>มีเจ้าหน้าที่รับผิดชอบแล้ว</p>}
      {duty !== "auditor" && (!row.assignee_id || row.assignee_id === actor.id) && <div className="flex flex-wrap gap-2">{moves[row.status]?.map(next =>
        <form action={update} key={next}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="previous" value={row.status}/>
          <input type="hidden" name="next" value={next}/><Button type="submit">{next === "review" ? "รับดำเนินการ" : states[next]}</Button></form>)}</div>}
      {["registrar","owner"].includes(duty) && ["review","waiting"].includes(row.status) &&
        <form className="grid gap-2" action={verify}><input type="hidden" name="id" value={row.id}/><label>รหัสบัญชีเดิมจากหน้าจัดการสมาชิก <input required name="target"/></label>
        {row.category === "duplicate" && <label>รหัสบัญชีที่สองเพื่อเปรียบเทียบประวัติ <input name="related" required/></label>}
        <label>วิธีที่ตรวจเจ้าของบัญชีแล้ว <select required name="proof" defaultValue=""><option value="" disabled>เลือกวิธี</option><option value="in_person">พบตัวที่วิทยาลัย</option><option value="registrar">ตรวจเทียบทะเบียนตามขั้นตอนวิทยาลัย</option><option value="guardian">ตรวจสิทธิ์ผู้ปกครองและตัวตนผู้เรียน</option></select></label><Button type="submit">ยืนยันผลตรวจและส่งขออนุมัติ</Button></form>}
      {row.target_user_id && <Link href={`/admin/users/${row.target_user_id}`} className="underline">เปิดบัญชีเดิมเพื่อตรวจประวัติ</Link>}
      {Array.isArray(row.record_comparison) && <details><summary>ประวัติ ณ เวลาตรวจทะเบียน</summary>{row.record_comparison.map((entry,i)=>{
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        return <p key={i}>บัญชี {String(entry.id)} · ลงทะเบียนเรียน {String(entry.enrollments)} · รอบอบรม {String(entry.registrations)} · รายการความก้าวหน้า {String(entry.progress)} · ผลสอบ {String(entry.assessments)} · วุฒิบัตร {String(entry.certificates)}</p>;
      })}</details>}
      {row.status === "approval" && ["approver","owner"].includes(duty) && actor.id !== row.reviewed_by && actor.id !== row.assignee_id &&
        <form action={approve}><input type="hidden" name="id" value={row.id}/><p>วิธีตรวจที่บันทึก {row.proof_method}</p><Button type="submit">อนุมัติให้ทะเบียนออกลิงก์</Button></form>}
      {row.status === "approved" && actor.id === row.reviewed_by && <IssueLink id={row.id}/>}
      <details><summary>ประวัติการดำเนินการ</summary><ol>{events.filter(e=>e.case_id===row.id).map((e,i)=><li key={i}>{states[e.status]} · {e.username ?? "ผู้ใช้งาน"} · {e.created_at.toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</li>)}</ol></details>
    </article>)}
    <nav className="flex gap-4">{page > 1 && <Link href={`?page=${page-1}`}>หน้าก่อน</Link>}{rows.length > 25 && <Link href={`?page=${page+1}`}>หน้าถัดไป</Link>}</nav>
  </main>;
}
