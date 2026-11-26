"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { createHmac } from "node:crypto";
import { hashToken } from "@upskill/core";
import { encryptSettingSecret } from "@upskill/infra/secret-box";
import { hitRateLimit } from "@upskill/infra/rate-limit";
import { ctx } from "@/server/context";
import { emailKey } from "@/server/rate-keys";
import { states } from "@/lib/recovery";

export type Receipt = { message: string; reference?: string; secret?: string };

async function allowed(action: string, subject: string) {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
  const { redis } = ctx();
  const windowMs = 15 * 60_000;
  const first = await hitRateLimit(redis, { name: "recover:" + action + ":ip", limit: 300, windowMs }, ip);
  if (!first.allowed) return false;
  return (await hitRateLimit(redis, { name: "recover:" + action, limit: 12, windowMs }, emailKey(subject))).allowed;
}

export async function requestHelp(_: Receipt, form: FormData): Promise<Receipt> {
  if (process.env.RECOVERY_CASE_INTAKE === "off") return {message:"ขณะนี้พักรับเรื่องออนไลน์ กรุณาติดต่อทะเบียนที่วิทยาลัย หรือติดตามเรื่องเดิมด้านล่าง"};
  const category = z.enum(["email","identity","duplicate","google","locked"]).safeParse(form.get("category"));
  const contact = z.union([z.email(), z.string().regex(/^0[0-9]{8,9}$/)]).safeParse(String(form.get("contact") ?? "").trim());
  if (!category.success || !contact.success || contact.data.length > 254) return { message: "กรุณาเลือกปัญหาและกรอกอีเมลหรือเบอร์โทรศัพท์ที่ติดต่อได้" };
  if (!(await allowed("open", contact.data))) return { message: "ส่งคำขอหลายครั้ง กรุณาลองอีกครั้งใน 15 นาที" };
  const { db, env } = ctx();
  const key = z.string().regex(/^[A-Za-z0-9_-]{43}$/).safeParse(form.get("requestKey"));
  if (!key.success) return { message: "กรุณาเปิดแบบฟอร์มอีกครั้ง" };
  const secret = createHmac("sha256",env.SETTINGS_ENCRYPTION_KEY).update(JSON.stringify(["recovery-receipt",key.data,category.data,contact.data])).digest("base64url");
  const digest = hashToken(secret).toString("hex");
  const row = await db.insertInto("recovery_cases").values({
    tracking_hash: digest, category: category.data,
    contact: encryptSettingSecret(contact.data, env.SETTINGS_ENCRYPTION_KEY),
    identifier: "",
  }).onConflict(c=>c.column("tracking_hash").doNothing()).returning("id").executeTakeFirst();
  const reference = row?.id ?? (await db.selectFrom("recovery_cases").select("id").where("tracking_hash","=",digest).executeTakeFirstOrThrow()).id;
  return { message: "รับเรื่องแล้ว โปรดเก็บเลขเรื่องและรหัสติดตามไว้เป็นส่วนตัว เจ้าหน้าที่จะติดต่อเพื่อตรวจสอบ", reference, secret };
}

export async function trackHelp(_: Receipt, form: FormData): Promise<Receipt> {
  const reference = z.uuid().safeParse(form.get("reference"));
  const secret = z.string().trim().min(32).max(128).safeParse(form.get("secret"));
  const absent = { message: "ไม่พบเรื่องที่ตรงกับเลขเรื่องและรหัสติดตาม" };
  if (!reference.success || !secret.success) return absent;
  if (!(await allowed("track", hashToken(secret.data).toString("hex")))) return { message: "กรุณาลองอีกครั้งใน 15 นาที" };
  const row = await ctx().db.selectFrom("recovery_cases").select(["status","issued_until"]).where("id", "=", reference.data)
    .where("tracking_hash", "=", hashToken(secret.data).toString("hex")).executeTakeFirst();
  return row ? { message: states[row.status === "issued" && row.issued_until && row.issued_until <= new Date() ? "expired" : row.status]! } : absent;
}
