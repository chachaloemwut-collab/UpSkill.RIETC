"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminPage } from "@/server/programs/admin-page";
import { ctx } from "@/server/context";
import { audit } from "@/server/audit";
import { approveCase, issueCaseGrant, reviewCase } from "@/server/admin/recovery-review";

function refresh(ok:boolean) {
  revalidatePath("/admin/recovery");
  if (!ok) redirect("/admin/recovery?conflict=1");
}
export async function verify(form:FormData) {
  const actor = await requireAdminPage();
  const proof = z.enum(["in_person","registrar","guardian"]).parse(form.get("proof"));
  const target = z.uuid().safeParse(form.get("target"));
  const related = z.uuid().nullable().safeParse(form.get("related") || null);
  refresh(target.success && related.success && await reviewCase(actor,z.uuid().parse(form.get("id")),target.data,proof,related.data));
}
export async function approve(form:FormData) {
  refresh(await approveCase(await requireAdminPage(),z.uuid().parse(form.get("id"))));
}
export async function issue(_:string,form:FormData) {
  const link = await issueCaseGrant(await requireAdminPage(),z.uuid().parse(form.get("id")));
  return link ? "ส่งมอบเป็นการส่วนตัวให้ผู้ที่ตรวจตัวตนแล้ว ลิงก์ใช้ได้ 30 นาที "+link : "ไม่สามารถออกลิงก์ กรุณาตรวจสอบสถานะล่าสุด";
}
export async function delegate(form:FormData) {
  const actor = await requireAdminPage();
  if (!actor.isSystemOwner) redirect("/");
  const target = z.uuid().safeParse(form.get("target"));
  const duty = z.enum(["support","registrar","approver","auditor"]).parse(form.get("duty"));
  if (!target.success) return refresh(false);
  const {db} = ctx();
  const user = await db.selectFrom("users").select("id").where("id","=",target.data).where("role","=","admin").where("status","=","active").where("is_system_owner","=",false).executeTakeFirst();
  if (!user) return refresh(false);
  await db.insertInto("recovery_staff").values({user_id:user.id,duty,delegated_by:actor.id}).onConflict(c=>c.column("user_id").doUpdateSet({duty,delegated_by:actor.id,updated_at:new Date()})).execute();
  await audit(db,{action:"recovery.staff_delegated",userId:actor.id,entityType:"user",entityId:user.id,details:{duty}});
  refresh(true);
}
