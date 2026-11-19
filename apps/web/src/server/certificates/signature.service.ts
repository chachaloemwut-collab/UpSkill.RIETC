/**
 * Per-course signature on certificates (admin only). The image is stored content-addressed in the certificate
 * storage, the course points at it, and every certificate snapshots the key at issue time
 * (issue.service.ts), so replacing or removing a signature never changes an issued certificate.
 * A course prints a signer (signature + name + title) only when its switch is on AND a signature exists.
 */
import "server-only";
import { createHash } from "node:crypto";
import { CERTIFICATE_CODE_RE } from "@upskill/core";
import { createSignatureStorage } from "@upskill/infra/storage";
import { ctx } from "../context";
import { audit } from "../audit";
import { HttpError } from "../http";
import type { CurrentUser } from "../auth/session";

export const SIGNATURE_MAX_BYTES = 1024 * 1024;

function sniffImage(bytes: Uint8Array): "png" | "jpg" | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return "png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "jpg";
  return null;
}

async function loadCourse(courseId: string) {
  const c = await ctx()
    .db.selectFrom("courses")
    .select(["id", "credential_signature_key", "credential_show_signer", "credential_signer_name"])
    .where("id", "=", courseId)
    .executeTakeFirst();
  if (!c) throw new HttpError(404, "NOT_FOUND");
  return c;
}

export async function uploadCourseSignature(admin: CurrentUser, courseId: string, bytes: Uint8Array, meta: { ip: string }) {
  const { db, env } = ctx();
  await loadCourse(courseId);
  if (bytes.byteLength === 0) throw new HttpError(400, "EMPTY_FILE", "ไฟล์ว่างเปล่า");
  if (bytes.byteLength > SIGNATURE_MAX_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "ไฟล์ลายเซ็นต้องไม่เกิน 1 MB");
  const ext = sniffImage(bytes);
  if (!ext) throw new HttpError(415, "UNSUPPORTED_FILE", "รองรับเฉพาะไฟล์ PNG (แนะนำพื้นหลังโปร่งใส) หรือ JPG");
  const key = `${createHash("sha256").update(bytes).digest("hex")}.${ext}`;
  await createSignatureStorage(env).save(key, bytes, ext === "png" ? "image/png" : "image/jpeg");
  await db.updateTable("courses").set({ credential_signature_key: key, updated_at: new Date() }).where("id", "=", courseId).execute();
  await audit(db, { action: "course.signature_uploaded", userId: admin.id, entityType: "course", entityId: courseId, ip: meta.ip, details: { key } });
  return { hasSignature: true };
}

/** Detach the signature (the file stays: issued certificates may reference it). Also turns the switch off. */
export async function removeCourseSignature(admin: CurrentUser, courseId: string, meta: { ip: string }) {
  const { db } = ctx();
  await loadCourse(courseId);
  await db.updateTable("courses").set({ credential_signature_key: null, credential_show_signer: false, updated_at: new Date() }).where("id", "=", courseId).execute();
  await audit(db, { action: "course.signature_removed", userId: admin.id, entityType: "course", entityId: courseId, ip: meta.ip });
  return { hasSignature: false, showSigner: false };
}

export async function setCourseSignerShown(admin: CurrentUser, courseId: string, show: boolean, meta: { ip: string }) {
  const { db } = ctx();
  const c = await loadCourse(courseId);
  if (show && !c.credential_signature_key) throw new HttpError(409, "NO_SIGNATURE", "อัปโหลดลายเซ็นก่อน จึงจะเปิดการแสดงผู้ลงนามได้");
  if (show && !c.credential_signer_name?.trim()) throw new HttpError(409, "NO_SIGNER_NAME", "กรอกชื่อผู้ลงนามในการตั้งค่าใบรับรองของหลักสูตรก่อน");
  await db.updateTable("courses").set({ credential_show_signer: show, updated_at: new Date() }).where("id", "=", courseId).execute();
  await audit(db, { action: "course.signer_toggled", userId: admin.id, entityType: "course", entityId: courseId, ip: meta.ip, details: { show } });
  return { showSigner: show };
}

async function readImage(key: string | null) {
  if (!key) return null;
  const bytes = await createSignatureStorage(ctx().env).read(key);
  return bytes ? { bytes, contentType: key.endsWith(".png") ? "image/png" : "image/jpeg" } : null;
}

/** Current course signature, for the admin's preview. */
export async function readCourseSignature(courseId: string) {
  return readImage((await loadCourse(courseId)).credential_signature_key);
}

/** The signature an issued certificate was printed with: owner or admin only (same rule as the PDF download). */
export async function readCertificateSignature(user: CurrentUser, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!CERTIFICATE_CODE_RE.test(code)) throw new HttpError(404, "NOT_FOUND");
  const c = await ctx().db.selectFrom("certificates").select(["user_id", "signature_key_snapshot"]).where("certificate_code", "=", code).executeTakeFirst();
  if (!c || (c.user_id !== user.id && user.role !== "admin")) throw new HttpError(404, "NOT_FOUND");
  return readImage(c.signature_key_snapshot);
}
