import "server-only";
import { ctx } from "./context";
import { HttpError } from "./http";
import type { CurrentUser } from "./auth/session";
import { audit } from "./audit";
export async function supportMember(actor:CurrentUser,id:string){
  if(actor.id!==id && actor.role!=="admin")throw new HttpError(404,"NOT_FOUND");
  const member=await ctx().db.selectFrom("users").select(["id","email","legal_full_name_th"]).where("id","=",id).where("deleted_at","is",null).executeTakeFirst();
  if(!member)throw new HttpError(404,"NOT_FOUND");return member;
}
export async function messages(actor:CurrentUser,id:string,before?:string,after?:string){
  await supportMember(actor,id);
  let q=ctx().db.selectFrom("support_messages").select(["id","author_id","body","created_at"]).where("member_id","=",id);
  if(before)q=q.where("id","<",before);
  if(after)q=q.where("id",">",after);
  const rows=await q.orderBy("id",after?"asc":"desc").limit(50).execute();
  return (after?rows:rows.reverse()).map(r=>({...r,created_at:new Date(r.created_at).toISOString()}));
}
export async function sendSupport(actor:CurrentUser,id:string,body:string,requestId:string){
  await supportMember(actor,id);
  await ctx().db.transaction().execute(async trx=>{
    const member=await trx.selectFrom("users").select("id").where("id","=",id).where("deleted_at","is",null).forUpdate().executeTakeFirst();
    if(!member)throw new HttpError(404,"NOT_FOUND");
    const msg=await trx.insertInto("support_messages").values({member_id:id,author_id:actor.id,body,request_id:requestId})
      .onConflict(c=>c.columns(["author_id","request_id"]).doNothing()).returning("id").executeTakeFirst();
    if(msg)await audit(trx,{action:"support.message_sent",userId:actor.id,entityType:"support_message",entityId:msg.id});
  });
}
