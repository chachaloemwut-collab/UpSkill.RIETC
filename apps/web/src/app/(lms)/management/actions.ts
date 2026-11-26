"use server";
import {redirect} from "next/navigation";
import {resourceKey} from "@/server/management/access";
import {setFilter} from "@/server/management/filter";
import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getCurrentUser} from "@/server/auth/session";
import {ctx} from "@/server/context";
import {HttpError} from "@/server/http";
import {duties} from "@/server/management/catalog";
import {decideRegistrations} from "@/server/programs/cohorts.service";
import {reviewApplication} from "@/server/courses/applications.service";
import {audit} from "@/server/audit";

async function actor() {
  const user=await getCurrentUser();
  if (!user) throw new HttpError(401,"UNAUTHENTICATED");
  return user;
}
export async function grantDuty(_:string,f:FormData) {
  const owner=await actor();
  if (!owner.isSystemOwner) throw new HttpError(403,"FORBIDDEN");
  const duty=String(f.get("duty"));
  const target=z.uuid().safeParse(f.get("user"));
  const kind=z.enum(["global","course","cohort"]).safeParse(f.get("kind"));
  const scope=z.uuid().safeParse(f.get("scope"));
  const reason=String(f.get("reason")??"").trim();
  const date=String(f.get("until")??"");
  const until=date ? new Date(date+"T23:59:59.999+07:00") : null;
  if (!target.success || !kind.success || !Object.hasOwn(duties,duty) || !reason || reason.length>500 || (kind.data!=="global" && !scope.success) ||
    (until && !(until.getTime()>Date.now()))) return "กรุณาตรวจรหัสสมาชิก ขอบเขต เหตุผล และวันสิ้นสุด";
  const {db}=ctx();
  const message=await db.transaction().execute(async trx=>{
    const user=await trx.selectFrom("users").select(["role","status"]).where("id","=",target.data).forShare().executeTakeFirst();
    if (!user || user.role==="admin" || user.status!=="active") return "กรุณาเลือกบัญชีผู้เรียนหรือผู้สอนที่เปิดใช้งาน ผู้ดูแลระบบมีสิทธิ์ส่วนกลางอยู่แล้ว";
    if (kind.data!=="global") {
      const table=kind.data==="course"?"courses":"program_cohorts";
      if (!(await trx.selectFrom(table).select("id").where("id","=",scope.data!).forShare().executeTakeFirst())) return "ไม่พบขอบเขตที่ระบุ";
    }
    const grant=await trx.insertInto("management_grants").values({
      user_id:target.data,duty,course_id:kind.data==="course"?scope.data!:null,cohort_id:kind.data==="cohort"?scope.data!:null,
      expires_at:until,reason,granted_by:owner.id,can_act:duty!=="auditor" && f.get("act")==="on",can_export:f.get("export")==="on",
    }).returning("id").executeTakeFirstOrThrow();
    await audit(trx,{action:"management.granted",userId:owner.id,entityType:"management_grant",entityId:grant.id,details:{duty,target:target.data,scope:kind.data}});
    return "บันทึกการมอบสิทธิ์แล้ว";
  });
  revalidatePath("/management");
  return message;
}

export async function revokeDuty(_:string,f:FormData) {
  const owner=await actor();
  if (!owner.isSystemOwner) throw new HttpError(403,"FORBIDDEN");
  const id=z.uuid().parse(f.get("id"));
  const reason=z.string().trim().min(1).max(500).safeParse(f.get("reason"));
  if (!reason.success) return "กรุณาระบุเหตุผลการถอนสิทธิ์";
  await ctx().db.transaction().execute(async trx=>{
    const row=await trx.updateTable("management_grants").set({revoked_at:new Date(),revoked_by:owner.id}).where("id","=",id).where("revoked_at","is",null).returning("id").executeTakeFirst();
    if (row) await audit(trx,{action:"management.revoked",userId:owner.id,entityType:"management_grant",entityId:id,details:{reason:reason.data}});
  });
  revalidatePath("/management");
  return "ถอนสิทธิ์แล้ว";
}

export async function reviewRecord(_:string,f:FormData) {
  const user=await actor();
  const id=z.uuid().parse(f.get("id"));
  const parent=z.uuid().parse(f.get("parent"));
  const action=String(f.get("decision"));
  const expected=String(f.get("expected"));
  const note=String(f.get("note")??"").trim();
  if (!note || note.length>500) return "กรุณาระบุเหตุผลไม่เกิน 500 ตัวอักษร";
  const ip=(await headers()).get("x-real-ip")??"0.0.0.0";
  try {
    switch (f.get("resource")) {
      case "registrations":
        await decideRegistrations(user,parent,{ids:[id],decision:z.enum(["approve","reject"]).parse(action),note},{ip},expected);
        break;
      case "applications":
        await reviewApplication(user,parent,id,{action:z.enum(["approve","reject"]).parse(action),staffNote:note},{ip},{mode:"applications",version:expected});
        break;
      case "payments": {
        const status=z.enum(["pending","paid","waived","not_required"]).parse(action);
        const receiptNo=String(f.get("receipt")??"").trim();
        if (receiptNo.length>100 || (status==="paid" && !receiptNo)) return "กรุณาระบุเลขที่ใบเสร็จเมื่อบันทึกการชำระ";
        await reviewApplication(user,parent,id,{paymentStatus:status,receiptNo},{ip},{mode:"payments",version:expected});
        break;
      }
      default: throw new HttpError(403,"FORBIDDEN");
    }
  } catch(error) {
    if (error instanceof HttpError) return error.code==="FORBIDDEN"?"สิทธิ์ของคุณไม่ครอบคลุมรายการนี้":error.message;
    throw error;
  }
  revalidatePath("/management");
  return "บันทึกผลแล้ว";
}

export async function search(f:FormData) {
  const user=await actor();
  const key=resourceKey(f.get("resource"));
  await setFilter(user,key,String(f.get("q")??""));
  redirect("/management?"+new URLSearchParams({resource:key,sort:String(f.get("sort")??""),direction:f.get("direction")==="asc"?"asc":"desc"}));
}
