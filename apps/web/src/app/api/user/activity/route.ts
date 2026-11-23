import {z} from "zod";
import {route} from "@/server/http";
import {audit} from "@/server/audit";
import {ctx} from "@/server/context";
import {activityScreen} from "@/lib/activity-path";
const Body=z.strictObject({screen:z.string().startsWith("/").max(600),event:z.enum(["view","print"])});
export const POST = route({auth:"optional",body:Body,rateLimit:({user,ip})=>[[{name:"page-activity",limit:user?180:1200,windowMs:60000},user?.id??ip]]},async({user,body})=>{
  await audit(ctx().db,{action:"activity.page",userId:user?.id??null,entityType:"screen",details:{screen:activityScreen(body.screen),event:body.event,source:"browser"}});
  return {ok:true};
});
