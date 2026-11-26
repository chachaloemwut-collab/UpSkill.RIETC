import {route,HttpError} from "@/server/http";
import {ctx} from "@/server/context";
import {audit} from "@/server/audit";
import {resources} from "@/server/management/catalog";
import {resourceKey,accessibleKeys,records} from "@/server/management/access";
import {filterFor} from "@/server/management/filter";

function cell(raw:unknown) {
  const value=raw instanceof Date?raw.toISOString():String(raw??"");
  return '"'+(/^[\s]*[=+@-]|^[\t\r\n]/.test(value)?"'":"")+value.replaceAll('"','""')+'"';
}
export const GET=route({auth:"required"},async ({req,user})=>{
  const key=resourceKey(req.nextUrl.searchParams.get("resource"));
  if (!(await accessibleKeys(user!,"export")).includes(key)) throw new HttpError(403,"FORBIDDEN");
  const db=ctx().db;
  const rows=await records(db,user!,key,{q:await filterFor(user!,key),page:1,sort:req.nextUrl.searchParams.get("sort")??"",desc:req.nextUrl.searchParams.get("direction")!=="asc",exporting:true});
  if (rows.length>5000) throw new HttpError(400,"FILTER_REQUIRED","กรุณากรองข้อมูลให้เหลือไม่เกิน 5,000 รายการ");
  const fields=resources[key].fields;
  const csv=[fields.map(cell).join(","),...rows.map(row=>fields.map(f=>cell(row[f])).join(","))].join("\r\n");
  await audit(db,{action:"management.exported",userId:user!.id,entityType:resources[key].table,details:{count:rows.length,view:key}});
  return new Response("\uFEFF"+csv,{headers:{"Content-Type":"text/csv; charset=UTF-8","Content-Disposition":`attachment; filename="${key}.csv"`,"Cache-Control":"private, no-store"}});
});
