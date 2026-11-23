import {z} from "zod";
import {route} from "@/server/http";
import {uuidParam} from "@/server/params";
import {messages,sendSupport} from "@/server/support";
type P={id:string};
const Body=z.strictObject({body:z.string().trim().min(1).max(2000),requestId:z.uuid()});
export const GET = route<never,P>({auth:"required"},async({params,user,req})=>{
  const before=req.nextUrl.searchParams.get("before"),after=req.nextUrl.searchParams.get("after");
  return { messages:await messages(user!,uuidParam(params.id),before?uuidParam(before):undefined,after?uuidParam(after):undefined) };
});
export const POST = route<typeof Body,P>({auth:"required",body:Body,rateLimit:({user})=>[[{name:"support:send",limit:30,windowMs:60000},user!.id]]},async({params,user,body})=>{
  await sendSupport(user!,uuidParam(params.id),body.body,body.requestId);return {ok:true};
});
