import "server-only";
import {sql, type Database, type Tx} from "@upskill/db";
import {ctx} from "../context";
import type {CurrentUser} from "../auth/session";
import {HttpError} from "../http";
import {resources, deskActions, type Resource} from "./catalog";

export type Operation = "read"|"act"|"export";
type Executor = Database|Tx;

export function resourceKey(key:unknown):Resource {
  if (typeof key !== "string" || !Object.hasOwn(resources,key)) throw new HttpError(404,"NOT_FOUND");
  return key as Resource;
}

function scopeColumns(key:Resource) {
  const {table,scope} = resources[key];
  const direct = (name:string)=>sql.ref("r."+name);
  const none = sql`NULL::uuid`;
  let course = none, cohort = none;
  if (scope === "course") course = direct(table === "courses" ? "id" : "course_id");
  if (scope === "cohort" || table === "enrollments" || table === "certificates") cohort = direct(table === "program_cohorts" ? "id" : "cohort_id");
  if (table === "course_applications") cohort = sql`(SELECT cohort_id FROM enrollments WHERE id=r.enrollment_id)`;
  if (scope === "lesson") course = sql`(SELECT course_id FROM lessons WHERE id=r.lesson_id)`;
  if (scope === "assignment") course = sql`(SELECT course_id FROM course_assignments WHERE id=r.assignment_id)`;
  if (scope === "enrollment" || scope === "attempt") {
    const id = scope === "attempt" ? sql`(SELECT enrollment_id FROM quiz_attempts WHERE id=r.attempt_id)` : direct("enrollment_id");
    course = sql`(SELECT course_id FROM enrollments WHERE id=${id})`;
    cohort = sql`(SELECT cohort_id FROM enrollments WHERE id=${id})`;
  }
  return {course,cohort};
}

export function accessPredicate(actor:CurrentUser,key:Resource,operation:Operation) {
  if (actor.isSystemOwner || actor.role === "admin") return sql`TRUE`;
  const {course,cohort} = scopeColumns(key);
  const duty = resources[key].duty;
  const allowedDuty = operation === "act" ? sql`g.duty=${duty}` : sql`g.duty IN (${duty},'auditor')`;
  const flag = operation === "act" ? sql`g.can_act` : operation === "export" ? sql`g.can_export` : sql`TRUE`;
  return sql`EXISTS (SELECT 1 FROM management_grants g WHERE g.user_id=${actor.id} AND g.revoked_at IS NULL
    AND g.starts_at <= now() AND (g.expires_at IS NULL OR g.expires_at > now()) AND ${allowedDuty} AND ${flag}
    AND ((g.course_id IS NULL AND g.cohort_id IS NULL) OR g.course_id=${course} OR g.cohort_id=${cohort}))`;
}

export function supportsScope(key: Resource, kind: "course" | "cohort" | "global") {
  const r = resources[key];
  if (kind === "course") return ["course","lesson","enrollment","assignment","attempt"].includes(r.scope);
  if (kind === "cohort") return ["cohort","enrollment","attempt"].includes(r.scope) ||
    ["certificates","enrollments","course_applications"].includes(r.table);
  return true;
}

export async function accessibleKeys(actor:CurrentUser,op:Operation="read") {
  const keys = Object.keys(resources) as Resource[];
  if (actor.isSystemOwner || actor.role === "admin") return keys;
  const grants = await ctx().db.selectFrom("management_grants").select(["duty","course_id","cohort_id","can_act","can_export"])
    .where("user_id","=",actor.id).where("revoked_at","is",null).where("starts_at","<=",sql<Date>`now()`)
    .where(eb=>eb.or([eb("expires_at","is",null),eb("expires_at",">",sql<Date>`now()`)])).execute();
  return keys.filter(k=>grants.some(g=>{
    const r=resources[k];
    if ((g.duty!==r.duty && !(g.duty==="auditor" && op!=="act")) || (op==="act" && !g.can_act) || (op==="export" && !g.can_export)) return false;
    return supportsScope(k,g.course_id ? "course" : g.cohort_id ? "cohort" : "global");
  }));
}

export async function authorizeRecord(db:Tx,actor:CurrentUser,key:Resource,id:string) {
  // Lock active assignments so revocation and mutation take effect in transaction order.
  if (actor.role !== "admin") await db.selectFrom("management_grants").select("id").where("user_id","=",actor.id).where("revoked_at","is",null).forShare().execute();
  const resource=resources[key];
  const res=await sql`SELECT r.id FROM ${sql.table(resource.table)} r WHERE r.id=${id} AND ${accessPredicate(actor,key,"act")} FOR UPDATE OF r`.execute(db);
  if (!res.rows.length) throw new HttpError(403,"FORBIDDEN");
}

export async function records(db:Executor,actor:CurrentUser,key:Resource,options:{page:number;q:string;sort:string;desc:boolean;exporting?:boolean}) {
  const resource=resources[key];
  const projection = resource.fields.map(f=>sql.ref("r."+f));
  const sort=resource.fields.includes(options.sort) ? options.sort : resource.fields[0]!;
  const find=options.q.trim().slice(0,100);
  const search=find ? sql` AND (${sql.join(projection.map(f=>sql`strpos(lower(${f}::text),lower(${find}))>0`),sql` OR `)})` : sql``;
  const source=sql`FROM ${sql.table(resource.table)} r WHERE ${accessPredicate(actor,key,options.exporting?"export":"read")}${search}`;
  const rowAction = !options.exporting && deskActions.includes(key)
    ? sql`, ${accessPredicate(actor,key,"act")} AS _can_act` : sql``;
  const limit=options.exporting?5001:26;
  const order=sql.join([sql`${sql.ref("r."+sort)} ${options.desc?sql`DESC`:sql`ASC`} NULLS LAST`,...projection]);
  return (await sql<Record<string,unknown>>`SELECT ${sql.join(projection)}${rowAction} ${source} ORDER BY ${order} LIMIT ${limit} OFFSET ${options.exporting?0:(options.page-1)*25}`.execute(db)).rows;
}
