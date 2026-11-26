import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { decryptSettingSecret } from "@upskill/infra/secret-box";
import { Button } from "@/components/ui";
import { categories, states } from "@/lib/recovery";
import { ctx } from "@/server/context";
import { requireAdminPage } from "@/server/programs/admin-page";

const moves: Record<string,string[]> = { open: ["review"], review: ["waiting","resolved","declined"], waiting: ["review","resolved","declined"] };

async function update(form: FormData) {
  "use server";
  const actor = await requireAdminPage();
  const id = z.uuid().parse(form.get("id"));
  const next = z.enum(["review","waiting","resolved","declined"]).parse(form.get("next"));
  const previous = String(form.get("previous"));
  const changed = await ctx().db.transaction().execute(async trx => {
    const row = await trx.selectFrom("recovery_cases").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
    if (!row || row.status !== previous || !moves[row.status]?.includes(next) || (row.assignee_id && row.assignee_id !== actor.id)) return false;
    await trx.updateTable("recovery_cases").set({status: next, assignee_id: actor.id, updated_at: new Date()}).where("id","=",id).execute();
    await trx.insertInto("recovery_case_events").values({case_id: id, actor_id: actor.id, status: next, note: ""}).execute();
    return true;
  });
  revalidatePath("/admin/recovery");
  if (!changed) redirect("/admin/recovery?conflict=1");
}

export default async function RecoveryQueue({searchParams}: {searchParams: Promise<{page?: string; conflict?: string}>}) {
  const actor = await requireAdminPage();
  const {db,env} = ctx();
  const params = await searchParams;
  const page = Math.min(1000000,Math.max(1,Number.parseInt(params.page ?? "",10) || 1));
  const rows = await db.selectFrom("recovery_cases").select(["id","category","status","assignee_id","contact","created_at"])
    .orderBy("created_at","desc").orderBy("id","desc").limit(26).offset((page-1)*25).execute();
  return <main className="mx-auto grid max-w-3xl gap-4"><h1 className="text-2xl font-semibold">เรื่องขอกู้บัญชีผู้เรียน</h1>
    <p>รับเรื่องก่อนเปิดข้อมูลติดต่อ ตรวจสอบตัวตนตามขั้นตอนของงานทะเบียนก่อนใช้เครื่องมือกู้บัญชี</p>
    <Link className="underline" href="/admin/users">ค้นหาบัญชีผู้เรียนเดิม</Link>
    {params.conflict && <p role="alert">สถานะเรื่องเปลี่ยนแล้ว กรุณาตรวจสอบผู้รับผิดชอบและสถานะล่าสุด</p>}
    {rows.length === 0 && <p>ไม่มีเรื่องในหน้านี้</p>}
    {rows.slice(0,25).map(row => <article className="grid gap-2 rounded border p-4" key={row.id}>
      <h2 className="font-semibold">{categories[row.category as keyof typeof categories]}</h2>
      <p>เลขเรื่อง {row.id}</p><p>{states[row.status]} · {row.created_at.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p>
      {row.assignee_id === actor.id && <p>ช่องทางติดต่อ {decryptSettingSecret(row.contact,env.SETTINGS_ENCRYPTION_KEY)}</p>}
      {row.assignee_id && row.assignee_id !== actor.id && <p>มีเจ้าหน้าที่รับผิดชอบแล้ว</p>}
      {(!row.assignee_id || row.assignee_id === actor.id) && <div className="flex flex-wrap gap-2">{moves[row.status]?.map(next =>
        <form action={update} key={next}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="previous" value={row.status}/>
          <input type="hidden" name="next" value={next}/><Button type="submit">{next === "review" ? "รับดำเนินการ" : states[next]}</Button></form>)}</div>}
    </article>)}
    <nav className="flex gap-4">{page > 1 && <Link href={`?page=${page-1}`}>หน้าก่อน</Link>}{rows.length > 25 && <Link href={`?page=${page+1}`}>หน้าถัดไป</Link>}</nav>
  </main>;
}
