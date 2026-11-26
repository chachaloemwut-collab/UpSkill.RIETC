"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { ctx } from "@/server/context";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { errorMessage } from "@/lib/errors";
import { maskEmail } from "@/lib/mask-email";

async function submit(path:string, body:Record<string,string>, handler:typeof forgot) {
  const original = await headers();
  const forwarded = new Headers(original);
  forwarded.set("content-type","application/json");
  forwarded.delete("content-length");
  const req = new NextRequest(new URL(path,ctx().env.APP_ORIGIN),{method:"POST",headers:forwarded,body:JSON.stringify(body)});
  return handler(req,{params:Promise.resolve({})});
}

export async function mailForm(_:string, form:FormData) {
  const email = String(form.get("email") ?? "");
  const res = await submit("/api/auth/forgot-password",{email},forgot);
  return res.ok ? "หากข้อมูลตรงกับบัญชีที่กู้คืนได้ กรุณาตรวจสอบ "+maskEmail(email) : errorMessage((await res.json()).error);
}

export async function passwordForm(_:string, form:FormData) {
  const password = String(form.get("password") ?? "");
  if (password !== form.get("confirm")) return "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
  const res = await submit("/api/auth/reset-password",{token:String(form.get("token") ?? ""),new_password:password},reset);
  if (!res.ok) return errorMessage((await res.json()).error);
  redirect("/login?reset=1");
}
