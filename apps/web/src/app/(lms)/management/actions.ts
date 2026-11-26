"use server";
import {redirect} from "next/navigation";
import {revokeCertificate,retryEmailDelivery} from "@/server/admin/admin.service";
import {authorizeRecord,resourceKey,supportsScope} from "@/server/management/access";
import {setFilter} from "@/server/management/filter";
import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getCurrentUser} from "@/server/auth/session";
import {ctx} from "@/server/context";
import {HttpError} from "@/server/http";
import {duties,resources,type Resource} from "@/server/management/catalog";
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
  const eligible = (Object.keys(resources) as Resource[]).some(k =>
    (duty === "auditor" || resources[k].duty === duty) && supportsScope(k,kind.data));
  if (!eligible) return "หน้าที่นี้ไม่มีทะเบียนสำหรับขอบเขตที่เลือก กรุณาเลือกขอบเขตใหม่";
  const {db}=ctx();
  const message=await db.transaction().execute(async trx=>{
    const user=await trx.selectFrom("users").select(["role","status","is_system_owner","scoped_management"]).where("id","=",target.data).forUpdate().executeTakeFirst();
    if (!user || user.is_system_owner || user.status!=="active") return "กรุณาเลือกบัญชีที่เปิดใช้งาน";
    if (user.role==="admin" && !user.scoped_management && f.get("restrictAdmin")!=="on") return "กรุณายืนยันการเปลี่ยนผู้ดูแลเดิมเป็นผู้ดูแลตามขอบเขต";
    if (kind.data!=="global") {
      const table=kind.data==="course"?"courses":"program_cohorts";
      if (!(await trx.selectFrom(table).select("id").where("id","=",scope.data!).forShare().executeTakeFirst())) return "ไม่พบขอบเขตที่ระบุ";
    }
    let existing = trx.selectFrom("management_grants").select("id").where("user_id","=",target.data)
      .where("duty","=",duty).where("revoked_at","is",null)
      .where(eb=>eb.or([eb("expires_at","is",null),eb("expires_at",">",new Date())]));
    existing = kind.data==="course" ? existing.where("course_id","=",scope.data!) : existing.where("course_id","is",null);
    existing = kind.data==="cohort" ? existing.where("cohort_id","=",scope.data!) : existing.where("cohort_id","is",null);
    if (await existing.executeTakeFirst()) return "มีการมอบหน้าที่นี้ในขอบเขตเดียวกันแล้ว กรุณาตรวจรายการสิทธิ์เดิม";
    if (user.role==="admin" && !user.scoped_management) await trx.updateTable("users").set({scoped_management:true}).where("id","=",target.data).execute();
    const grant=await trx.insertInto("management_grants").values({
      user_id:target.data,duty,course_id:kind.data==="course"?scope.data!:null,cohort_id:kind.data==="cohort"?scope.data!:null,
      expires_at:until,reason,granted_by:owner.id,can_act:duty!=="auditor" && f.get("act")==="on",can_export:f.get("export")==="on",
    }).returning("id").executeTakeFirstOrThrow();
    await audit(trx,{action:"management.granted",userId:owner.id,entityType:"management_grant",entityId:grant.id,details:{duty,target:target.data,scope:kind.data,restrictedAdmin:user.role==="admin" && !user.scoped_management}});
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
  const parent=()=>z.uuid().parse(f.get("parent"));
  const action=String(f.get("decision"));
  const expected=String(f.get("expected"));
  const note=String(f.get("note")??"").trim();
  if (!note || note.length>500) return "กรุณาระบุเหตุผลไม่เกิน 500 ตัวอักษร";
  const ip=(await headers()).get("x-real-ip")??"0.0.0.0";
  try {
    switch (f.get("resource")) {
      case "registrations":
        await decideRegistrations(user,parent(),{ids:[id],decision:z.enum(["approve","reject"]).parse(action),note},{ip},expected);
        break;
      case "applications":
        await reviewApplication(user,parent(),id,{action:z.enum(["approve","reject"]).parse(action),staffNote:note},{ip},{mode:"applications",version:expected,reason:note});
        break;
      case "payments": {
        const status=z.enum(["pending","paid","waived","not_required"]).parse(action);
        const receiptNo=String(f.get("receipt")??"").trim();
        if (receiptNo.length>100 || (status==="paid" && !receiptNo)) return "กรุณาระบุเลขที่ใบเสร็จเมื่อบันทึกการชำระ";
        await reviewApplication(user,parent(),id,{paymentStatus:status,receiptNo},{ip},{mode:"payments",version:expected,reason:note});
        break;
      }
      case "certificates":
        if (action !== "revoke" || note.length < 5) return "กรุณายืนยันการเพิกถอนและระบุเหตุผลอย่างน้อย 5 ตัวอักษร";
        await revokeCertificate(user.id,String(f.get("code")),note,{ip},{actor:user,id});
        break;
      case "announcements":
      case "outbox": {
        const key = resourceKey(f.get("resource"));
        await ctx().db.transaction().execute(async trx => {
          await authorizeRecord(trx,user,key,id);
          if (key === "outbox") {
            if (action !== "retry") throw new HttpError(400,"INVALID_ACTION");
            await retryEmailDelivery(id,trx);
          } else {
            const pin = z.enum(["pin","unpin"]).parse(action);
            const current = await trx.selectFrom("announcements").select("updated_at").where("id","=",id).executeTakeFirstOrThrow();
            if (current.updated_at.toISOString() !== expected) throw new HttpError(409,"STALE_RECORD","รายการเปลี่ยนแล้ว กรุณาเปิดข้อมูลล่าสุด");
            await trx.updateTable("announcements").set({is_pinned:pin==="pin"}).where("id","=",id).execute();
          }
          await audit(trx,{action:"management.updated",userId:user.id,entityType:key,entityId:id,ip,details:{action,reason:note}});
        });
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

export async function restoreAdmin(_: string, form: FormData) {
  const owner = await actor();
  if (!owner.isSystemOwner) throw new HttpError(403, "FORBIDDEN");
  const target = z.uuid().safeParse(form.get("target"));
  const reason = z.string().trim().min(1).max(500).safeParse(form.get("reason"));
  if (!target.success || !reason.success || form.get("confirmed") !== "on") return "กรุณาระบุบัญชี เหตุผล และยืนยันการคืนสิทธิ์";
  const restored = await ctx().db.transaction().execute(async trx => {
    const changed = await trx.updateTable("users").set({scoped_management:false})
      .where("id","=",target.data).where("scoped_management","=",true).where("role","=","admin")
      .where("is_system_owner","=",false).where("status","=","active").returning("id").executeTakeFirst();
    if (!changed) return false;
    await audit(trx,{action:"management.granted",userId:owner.id,entityType:"user",entityId:changed.id,details:{access:"global_admin_restored",reason:reason.data}});
    return true;
  });
  revalidatePath("/management");
  return restored ? "คืนสิทธิ์ผู้ดูแลทั้งระบบแล้ว" : "ไม่พบบัญชีผู้ดูแลที่จำกัดขอบเขตและเปิดใช้งาน";
}

export async function findGrantTarget(kind: "user" | "course" | "cohort", term: string) {
  const owner = await actor();
  if (!owner.isSystemOwner) throw new HttpError(403, "FORBIDDEN");
  const needle = z.string().trim().min(2).max(100).parse(term);
  const starts = needle.replace(/[\\%_]/g, "\\$&") + "%";
  const db = ctx().db;
  if (kind === "user") {
    const rows = await db.selectFrom("users").select(["id", "username", "legal_full_name_th"])
      .where("status", "=", "active").where("is_system_owner", "=", false)
      .where(eb => eb.or([eb("username", "ilike", starts), eb("legal_full_name_th", "ilike", starts)]))
      .orderBy("username").orderBy("id").limit(20).execute();
    return rows.map(row => ({id:row.id,label:[row.legal_full_name_th,row.username].filter(Boolean).join(" · ") || row.id}));
  }
  const table = z.enum(["course","cohort"]).parse(kind) === "course" ? "courses" : "program_cohorts";
  return db.selectFrom(table).select(["id","title as label"]).where("title","ilike",starts)
    .orderBy("title").orderBy("id").limit(20).execute();
}
