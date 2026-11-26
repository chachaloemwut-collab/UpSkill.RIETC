import "server-only";
import { sql } from "@upskill/db";
import { generateToken, hashToken } from "@upskill/core";
import { ctx } from "../context";
import { HttpError } from "../http";
import type { CurrentUser } from "../auth/session";

export const duties = {
  support: "เจ้าหน้าที่ช่วยเหลือ",
  registrar: "เจ้าหน้าที่ตรวจทะเบียน",
  approver: "ผู้อนุมัติ",
  auditor: "ผู้ตรวจสอบ",
};

export async function dutyOf(actor: CurrentUser) {
  if (actor.role !== "admin") throw new HttpError(403,"FORBIDDEN");
  if (actor.isSystemOwner) return "owner";
  const assigned = await ctx().db.selectFrom("recovery_staff").select("duty").where("user_id","=",actor.id).executeTakeFirst();
  return assigned?.duty ?? "support";
}

export async function reviewCase(actor: CurrentUser, id: string, target: string, proof: string, related: string | null) {
  const duty = await dutyOf(actor);
  if (duty !== "registrar" && duty !== "owner") throw new HttpError(403,"FORBIDDEN");
  const {db} = ctx();
  return db.transaction().execute(async trx => {
    const row = await trx.selectFrom("recovery_cases").selectAll().where("id","=",id).forUpdate().executeTakeFirst();
    if (!row || !["review","waiting"].includes(row.status)) return false;
    const user = await trx.selectFrom("users").select(["id","role","is_system_owner","status"]).where("id","=",target).forShare().executeTakeFirst();
    if (!user || user.role === "admin" || user.is_system_owner || user.status !== "active" || user.id === actor.id) return false;
    if (row.category === "duplicate" && !related) return false;
    if (related) {
      if (related === target || related === actor.id) return false;
      const other = await trx.selectFrom("users").select("id").where("id","=",related).where("is_system_owner","=",false).where("role","!=","admin").executeTakeFirst();
      if (!other) return false;
    }
    const history = await sql<{id:string; enrollments:number; registrations:number; certificates:number; progress:number; assessments:number}>`
      SELECT u.id,
        (SELECT count(*)::int FROM enrollments e WHERE e.user_id=u.id) AS enrollments,
        (SELECT count(*)::int FROM cohort_registrations c WHERE c.user_id=u.id) AS registrations,
        (SELECT count(*)::int FROM certificates c WHERE c.user_id=u.id) AS certificates,
        (SELECT count(*)::int FROM lesson_progress p JOIN enrollments e ON e.id=p.enrollment_id WHERE e.user_id=u.id) AS progress,
        (SELECT count(*)::int FROM quiz_attempts q JOIN enrollments e ON e.id=q.enrollment_id WHERE e.user_id=u.id) AS assessments
      FROM users u WHERE u.id=${target}::uuid OR u.id=${related}::uuid ORDER BY u.id
    `.execute(trx);
    await trx.updateTable("recovery_cases").set({approved_by:null,issued_until:null,related_user_id:related,record_comparison:JSON.stringify(history.rows),target_user_id:target, reviewed_by:actor.id, proof_method:proof,status:"approval",updated_at:new Date()}).where("id","=",id).execute();
    await trx.insertInto("recovery_case_events").values({case_id:id,actor_id:actor.id,status:"approval",note:proof}).execute();
    return true;
  });
}

export async function approveCase(actor: CurrentUser,id:string) {
  const duty = await dutyOf(actor);
  if (duty !== "approver" && duty !== "owner") throw new HttpError(403,"FORBIDDEN");
  return ctx().db.transaction().execute(async trx => {
    const row = await trx.updateTable("recovery_cases").set({approved_by:actor.id,status:"approved",updated_at:new Date()})
      .where("id","=",id).where("status","=","approval").where("reviewed_by","!=",actor.id).where("assignee_id","!=",actor.id).returning("id").executeTakeFirst();
    if (!row) return false;
    await trx.insertInto("recovery_case_events").values({case_id:id,actor_id:actor.id,status:"approved",note:""}).execute();
    return true;
  });
}

export async function issueCaseGrant(actor: CurrentUser,id:string) {
  if (process.env.RECOVERY_CASE_ISSUANCE === "off") return null;
  const duty = await dutyOf(actor);
  if (duty !== "registrar" && duty !== "owner") throw new HttpError(403,"FORBIDDEN");
  const {db,env} = ctx();
  return db.transaction().execute(async trx => {
    const row = await trx.selectFrom("recovery_cases").selectAll().where("id","=",id).forUpdate().executeTakeFirst();
    if (row?.status !== "approved" || row.reviewed_by !== actor.id || !row.target_user_id) return null;
    const target = await trx.selectFrom("users").select(["role","status","is_system_owner"]).where("id","=",row.target_user_id).forUpdate().executeTakeFirst();
    if (!target || target.role === "admin" || target.status !== "active" || target.is_system_owner) return null;
    const secret = generateToken();
    const until = new Date(Date.now()+30*60_000);
    await trx.updateTable("password_reset_tokens").set({used_at:new Date()}).where("user_id","=",row.target_user_id).where("used_at","is",null).execute();
    await trx.insertInto("password_reset_tokens").values({user_id:row.target_user_id,recovery_case_id:id,token_hash:hashToken(secret),reset_method:"admin_link",expires_at:until}).execute();
    await trx.updateTable("recovery_cases").set({status:"issued",issued_until:until,updated_at:new Date()}).where("id","=",id).execute();
    await trx.insertInto("recovery_case_events").values({case_id:id,actor_id:actor.id,status:"issued",note:""}).execute();
    return env.APP_ORIGIN+"/reset-password?token="+secret;
  });
}
