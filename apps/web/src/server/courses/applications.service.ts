/**
 * Course application forms (ใบสมัครเรียนรายวิชา). Rules live in @upskill/core application.ts; this module stores
 * applications, turns approved ones into enrollments, and gives course managers the staff section and CSV export.
 * Personal data: managers only (IDOR via loadOwnedCourse), exports audited, anonymized on account erasure.
 */
import "server-only";
import {
  ADULT_AGE,
  APPLICATION_FILE_EXT,
  APPLICATION_FILE_MAX_BYTES,
  APPLICATION_FILE_MAX_PENDING,
  PDPA_NOTICE_VERSION,
  ageOn,
  cleanFileName,
  sniffApplicationFile,
  formatApplicationNo,
  parseApplicationSettings,
  validateApplication,
  type ApplicationInput,
  type ApplicationSettings,
  type PaymentStatus,
  type VerificationStatus,
} from "@upskill/core";
import { createHash, randomUUID } from "node:crypto";
import { sql } from "@upskill/db";
import { createApplicationFileStorage } from "@upskill/infra/storage";
import { ctx } from "../context";
import { HttpError } from "../http";
import { audit } from "../audit";
import type { CurrentUser } from "../auth/session";
import { assertProfileComplete, toIsoDate } from "../auth/profile.service";
import { insertEnrollment, loadEnrollableCourse } from "./courses.service";
import { loadOwnedCourse } from "./instructor.service";

/** Calendar date of a timestamp in Thailand (YYYY-MM-DD); DATE columns use toIsoDate instead. */
const bangkokDate = (d: Date | string) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

async function loadProfile(userId: string) {
  return ctx()
    .db.selectFrom("user_profiles as p")
    .innerJoin("users as u", "u.id", "p.user_id")
    .select([
      "u.email", "p.title_th", "p.first_name_th", "p.last_name_th", "p.title_en", "p.first_name_en", "p.last_name_en",
      "p.birth_date", "p.national_id_last4", "p.phone", "p.address_line", "p.subdistrict", "p.district", "p.province", "p.postal_code",
      "p.guardian_name", "p.guardian_phone",
    ])
    .where("p.user_id", "=", userId)
    .executeTakeFirst();
}

function courseSnapshot(course: { title: string }, s: ApplicationSettings) {
  return { title: course.title, courseCode: s.courseCode, intake: s.intake, schedule: s.schedule, venue: s.venue, fee: s.fee };
}

/** Everything the application page needs: settings, pre-filled profile, and this user's existing application. */
export async function getApplyContext(user: CurrentUser, courseId: string) {
  const course = await loadEnrollableCourse(user, courseId);
  const settings = parseApplicationSettings(course.application_settings);
  const profile = await loadProfile(user.id);
  const existing = await getMyApplication(user.id, courseId);
  const pendingFiles = existing ? [] : await pendingFilesOf(user.id, courseId);
  const birth = profile ? toIsoDate(profile.birth_date) : null;
  return {
    course: { id: course.id, title: course.title, slug: course.slug },
    settings,
    profile: profile ? { ...profile, birth_date: birth } : null,
    minor: birth ? ageOn(birth, new Date()) < ADULT_AGE : false,
    application: existing,
    pendingFiles,
  };
}

// ------------------------------------------------------------------ attached files

const FILE_COLUMNS = ["id", "doc_key", "original_name", "content_type", "size_bytes", "created_at"] as const;

async function pendingFilesOf(userId: string, courseId: string) {
  return ctx()
    .db.selectFrom("course_application_files")
    .select(FILE_COLUMNS)
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .where("application_id", "is", null)
    .orderBy("created_at", "desc")
    .execute();
}

/** Upload one document file before submitting (replaces an earlier file for the same document). */
export async function uploadApplicationFile(user: CurrentUser, courseId: string, docKey: string, bytes: Uint8Array, rawName: string) {
  const { db, env } = ctx();
  const course = await loadEnrollableCourse(user, courseId);
  const settings = parseApplicationSettings(course.application_settings);
  if (!settings.enabled || settings.documentUploads === "off") throw new HttpError(409, "UPLOADS_NOT_ENABLED", "หลักสูตรนี้ไม่ได้เปิดให้แนบไฟล์");
  if (!settings.documents.some((d) => d.key === docKey)) throw new HttpError(400, "UNKNOWN_DOCUMENT");
  if (bytes.byteLength === 0) throw new HttpError(400, "EMPTY_FILE", "ไฟล์ว่างเปล่า");
  if (bytes.byteLength > APPLICATION_FILE_MAX_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "ไฟล์ใหญ่เกิน 5 MB");
  const type = sniffApplicationFile(bytes);
  if (!type) throw new HttpError(415, "UNSUPPORTED_FILE", "รองรับเฉพาะไฟล์ PDF, JPG หรือ PNG");
  if (await getMyApplication(user.id, courseId)) throw new HttpError(409, "APPLICATION_EXISTS", "ส่งใบสมัครแล้ว แก้ไขไฟล์ไม่ได้");
  const pending = await pendingFilesOf(user.id, courseId);
  if (pending.length >= APPLICATION_FILE_MAX_PENDING) throw new HttpError(409, "TOO_MANY_FILES", "แนบไฟล์ได้ไม่เกิน 20 ไฟล์");

  const id = randomUUID();
  const storageKey = `${courseId}/${user.id}/${id}.${APPLICATION_FILE_EXT[type]}`;
  const storage = createApplicationFileStorage(env);
  await storage.save(storageKey, bytes, type);
  const row = await db
    .insertInto("course_application_files")
    .values({
      id, course_id: courseId, user_id: user.id, doc_key: docKey, original_name: cleanFileName(rawName, type),
      content_type: type, size_bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest(), storage_key: storageKey,
    })
    .returning(FILE_COLUMNS)
    .executeTakeFirstOrThrow();
  // One file per document: drop older pending files for the same document
  for (const old of pending.filter((f) => f.doc_key === docKey)) await removePendingFile(user.id, courseId, old.id);
  return row;
}

async function removePendingFile(userId: string, courseId: string, fileId: string) {
  const { db, env } = ctx();
  const row = await db
    .deleteFrom("course_application_files")
    .where("id", "=", fileId)
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .where("application_id", "is", null)
    .returning("storage_key")
    .executeTakeFirst();
  if (row) await createApplicationFileStorage(env).remove(row.storage_key);
  return !!row;
}

export async function deletePendingApplicationFile(user: CurrentUser, courseId: string, fileId: string) {
  if (!(await removePendingFile(user.id, courseId, fileId))) throw new HttpError(404, "NOT_FOUND");
}

/** Download: the applicant, or a manager of the course. Everyone else gets 404 (no existence leak). */
export async function readApplicationFile(viewer: CurrentUser, courseId: string, fileId: string) {
  const { db, env } = ctx();
  const f = await db
    .selectFrom("course_application_files")
    .select(["user_id", "storage_key", "content_type", "original_name"])
    .where("id", "=", fileId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
  if (!f) throw new HttpError(404, "NOT_FOUND");
  if (f.user_id !== viewer.id) {
    try {
      await loadOwnedCourse(viewer, courseId);
    } catch {
      throw new HttpError(404, "NOT_FOUND");
    }
  }
  const bytes = await createApplicationFileStorage(env).read(f.storage_key);
  if (!bytes) throw new HttpError(404, "NOT_FOUND");
  return { bytes, contentType: f.content_type, name: f.original_name };
}

/** Removes every stored file of a user (account erasure). Best effort on the storage side. */
export async function deleteAllApplicationFilesOf(userId: string) {
  const { db, env } = ctx();
  const rows = await db.deleteFrom("course_application_files").where("user_id", "=", userId).returning("storage_key").execute();
  const storage = createApplicationFileStorage(env);
  for (const r of rows) await storage.remove(r.storage_key).catch(() => undefined);
  return rows.length;
}

export async function getMyApplication(userId: string, courseId: string) {
  const { db } = ctx();
  const app = await db
    .selectFrom("course_applications")
    .select([
      "id", "application_no", "status", "verification_status", "payment_status", "receipt_no", "created_at", "course_snapshot",
      "applicant", "education", "occupation", "guardian", "documents", "declaration_name", "declared_at",
    ])
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
  if (!app) return undefined;
  const files = await db.selectFrom("course_application_files").select(FILE_COLUMNS).where("application_id", "=", app.id).orderBy("created_at").execute();
  return { ...app, files, courseId };
}

export async function submitApplication(user: CurrentUser, courseId: string, input: ApplicationInput, meta: { ip: string }) {
  const { db } = ctx();
  const course = await loadEnrollableCourse(user, courseId);
  const settings = parseApplicationSettings(course.application_settings);
  if (!settings.enabled) throw new HttpError(409, "APPLICATION_NOT_ENABLED", "หลักสูตรนี้ไม่ต้องกรอกใบสมัคร");
  await assertProfileComplete(user.id);
  const profile = await loadProfile(user.id);
  if (!profile) throw new HttpError(409, "PROFILE_REQUIRED");

  const birth = toIsoDate(profile.birth_date);
  const minor = ageOn(birth, new Date()) < ADULT_AGE;
  const pendingFiles = settings.documentUploads === "off" ? [] : await pendingFilesOf(user.id, courseId);
  const { value, errors } = validateApplication(settings, input, {
    minor,
    uploadedDocKeys: pendingFiles.map((f) => f.doc_key),
    expectedSignature: `${profile.first_name_th} ${profile.last_name_th}`,
    expectedSignatureWithTitle: `${profile.title_th}${profile.first_name_th} ${profile.last_name_th}`,
  });
  if (!value) throw new HttpError(422, "APPLICATION_INVALID", Object.values(errors)[0] ?? "ข้อมูลใบสมัครไม่ครบถ้วน");

  const result = await db.transaction().execute(async (trx) => {
    const dup = await trx.selectFrom("course_applications").select("application_no").where("course_id", "=", courseId).where("user_id", "=", user.id).executeTakeFirst();
    if (dup) throw new HttpError(409, "APPLICATION_EXISTS", `คุณส่งใบสมัครหลักสูตรนี้แล้ว (เลขที่ ${dup.application_no})`);
    const enrolled = await trx.selectFrom("enrollments").select("id").where("course_id", "=", courseId).where("user_id", "=", user.id).executeTakeFirst();
    if (enrolled) throw new HttpError(409, "ALREADY_ENROLLED", "คุณลงทะเบียนหลักสูตรนี้แล้ว");

    const seq = await sql<{ n: string }>`select nextval('course_application_no_seq')::text as n`.execute(trx);
    const now = new Date();
    const applicationNo = formatApplicationNo(now, Number(seq.rows[0]!.n));
    const approved = !settings.requireApproval;
    const enrollmentId = approved ? await insertEnrollment(trx, user, course) : null;
    const documents = Object.fromEntries(settings.documents.map((d) => [d.key, { label: d.label, required: d.required, declared: value.documents[d.key] === true, verified: null }]));
    const app = await trx
      .insertInto("course_applications")
      .values({
        application_no: applicationNo,
        course_id: courseId,
        user_id: user.id,
        enrollment_id: enrollmentId,
        course_snapshot: JSON.stringify(courseSnapshot(course, settings)),
        applicant: JSON.stringify({
          titleTh: profile.title_th, firstNameTh: profile.first_name_th, lastNameTh: profile.last_name_th,
          titleEn: profile.title_en, firstNameEn: profile.first_name_en, lastNameEn: profile.last_name_en,
          birthDate: birth, nationalIdLast4: profile.national_id_last4, ...value.contact, email: value.contact.email || profile.email,
        }),
        education: value.education ? JSON.stringify(value.education) : null,
        occupation: value.occupation ? JSON.stringify(value.occupation) : null,
        guardian: value.guardian ? JSON.stringify(value.guardian) : null,
        documents: JSON.stringify(documents),
        declaration_name: value.signatureName,
        declared_at: now,
        pdpa_notice_version: PDPA_NOTICE_VERSION,
        status: approved ? "approved" : "submitted",
        payment_status: settings.fee > 0 ? "pending" : "not_required",
      })
      .returning(["id", "application_no", "status"])
      .executeTakeFirstOrThrow();
    // Attach the pending files (one per document, the newest) to the submitted application
    const keep = new Map<string, string>();
    for (const f of pendingFiles) if (!keep.has(f.doc_key) && settings.documents.some((d) => d.key === f.doc_key)) keep.set(f.doc_key, f.id);
    if (keep.size) await trx.updateTable("course_application_files").set({ application_id: app.id }).where("id", "in", [...keep.values()]).execute();
    return app;
  });
  await audit(db, { action: "course.application_submitted", userId: user.id, entityType: "course", entityId: courseId, ip: meta.ip, details: { applicationNo: result.application_no } });
  return { applicationNo: result.application_no, status: result.status as "approved" | "submitted" };
}

// ------------------------------------------------------------------ staff section (course managers)

export async function listApplications(manager: CurrentUser, courseId: string) {
  await loadOwnedCourse(manager, courseId);
  return ctx()
    .db.selectFrom("course_applications as a")
    .select([
      "a.id", "a.application_no", "a.status", "a.verification_status", "a.payment_status", "a.receipt_no", "a.staff_note",
      "a.created_at", "a.reviewed_at", "a.applicant", "a.education", "a.occupation", "a.guardian", "a.documents",
      "a.declaration_name", "a.declared_at", "a.course_snapshot", "a.enrollment_id",
    ])
    .where("a.course_id", "=", courseId)
    .orderBy("a.created_at", "desc")
    .limit(2000)
    .execute()
    .then(async (apps) => {
      if (apps.length === 0) return [];
      const files = await ctx()
        .db.selectFrom("course_application_files")
        .select(["application_id", ...FILE_COLUMNS])
        .where("application_id", "in", apps.map((a) => a.id))
        .orderBy("created_at")
        .execute();
      return apps.map((a) => ({ ...a, files: files.filter((f) => f.application_id === a.id) }));
    });
}

export interface ApplicationReview {
  action?: "approve" | "reject" | undefined;
  verificationStatus?: VerificationStatus | undefined;
  paymentStatus?: PaymentStatus | undefined;
  receiptNo?: string | null | undefined;
  staffNote?: string | null | undefined;
  documentsVerified?: Record<string, boolean | null> | undefined;
}

export async function reviewApplication(manager: CurrentUser, courseId: string, applicationId: string, r: ApplicationReview, meta: { ip: string }) {
  const course = await loadOwnedCourse(manager, courseId);
  const { db } = ctx();
  await db.transaction().execute(async (trx) => {
    const app = await trx
      .selectFrom("course_applications as a")
      .innerJoin("users as u", "u.id", "a.user_id")
      .select(["a.id", "a.status", "a.user_id", "a.documents", "u.email", "u.deleted_at"])
      .where("a.id", "=", applicationId)
      .where("a.course_id", "=", courseId)
      .forUpdate("a")
      .executeTakeFirst();
    if (!app) throw new HttpError(404, "NOT_FOUND");

    const set: Record<string, unknown> = { updated_at: new Date(), reviewed_by: manager.id, reviewed_at: new Date() };
    if (r.action === "approve" && app.status !== "approved") {
      if (app.deleted_at) throw new HttpError(409, "ACCOUNT_DELETED", "บัญชีผู้สมัครถูกลบแล้ว");
      const c = await trx.selectFrom("courses").select(["id", "title", "slug"]).where("id", "=", courseId).executeTakeFirstOrThrow();
      set.enrollment_id = await insertEnrollment(trx, { id: app.user_id, email: app.email }, c);
      set.status = "approved";
    } else if (r.action === "reject") {
      if (app.status === "approved") throw new HttpError(409, "ALREADY_APPROVED", "ใบสมัครนี้ลงทะเบียนแล้ว ไม่สามารถเปลี่ยนเป็นไม่ผ่านได้");
      set.status = "rejected";
    }
    if (r.verificationStatus) set.verification_status = r.verificationStatus;
    if (r.paymentStatus) set.payment_status = r.paymentStatus;
    if (r.receiptNo !== undefined) set.receipt_no = r.receiptNo?.trim() || null;
    if (r.staffNote !== undefined) set.staff_note = r.staffNote?.trim() || null;
    if (r.documentsVerified) {
      const docs = { ...((app.documents ?? {}) as Record<string, { verified?: boolean | null }>) };
      for (const [k, v] of Object.entries(r.documentsVerified)) if (docs[k]) docs[k] = { ...docs[k], verified: v };
      set.documents = JSON.stringify(docs);
    }
    await trx.updateTable("course_applications").set(set).where("id", "=", app.id).execute();
  });
  await audit(db, { action: "course.application_reviewed", userId: manager.id, entityType: "course", entityId: course.id, ip: meta.ip, details: { applicationId, action: r.action ?? null } });
}

const STATUS_TH: Record<string, string> = { submitted: "รอพิจารณา", approved: "ลงทะเบียนแล้ว", rejected: "ไม่ผ่านการพิจารณา" };
const VERIFY_TH: Record<string, string> = { pending: "รอตรวจ", verified: "ครบถ้วน", incomplete: "ไม่ครบ" };
const PAY_TH: Record<string, string> = { not_required: "ไม่มีค่าใช้จ่าย", pending: "รอชำระ", paid: "ชำระแล้ว", waived: "ยกเว้น" };
// Quote every cell; neutralize spreadsheet formulas (CSV injection)
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`;
};

export async function exportApplicationsCsv(manager: CurrentUser, courseId: string, meta: { ip: string }): Promise<{ csv: string; filename: string; rows: number }> {
  const course = await loadOwnedCourse(manager, courseId);
  const rows = await listApplications(manager, courseId);
  const header = [
    "เลขที่ใบสมัคร", "วันที่สมัคร", "สถานะ", "คำนำหน้า", "ชื่อ", "นามสกุล", "ชื่อ-สกุล (อังกฤษ)", "วันเกิด", "เลขบัตร (4 หลักท้าย)",
    "โทรศัพท์", "อีเมล", "ที่อยู่", "ตำบล/แขวง", "อำเภอ/เขต", "จังหวัด", "รหัสไปรษณีย์",
    "ระดับการศึกษา", "สถานศึกษา", "วุฒิการศึกษา", "อาชีพ", "หน่วยงาน/สถานประกอบการ",
    "ผู้ปกครอง", "ความสัมพันธ์", "โทรผู้ปกครอง", "เอกสารที่แจ้งว่าจะยื่น", "ผลตรวจหลักฐาน", "การชำระเงิน", "เลขที่ใบเสร็จ", "หมายเหตุเจ้าหน้าที่", "ลงชื่อผู้สมัคร",
  ];
  const body = rows.map((r) => {
    const a = (r.applicant ?? {}) as Record<string, string>;
    const ed = (r.education ?? {}) as Record<string, string>;
    const oc = (r.occupation ?? {}) as Record<string, string>;
    const g = (r.guardian ?? {}) as Record<string, string>;
    const docs = Object.values((r.documents ?? {}) as Record<string, { label: string; declared: boolean }>).filter((d) => d.declared).map((d) => d.label).join("; ");
    return [
      r.application_no, bangkokDate(r.created_at), STATUS_TH[r.status] ?? r.status, a.titleTh, a.firstNameTh, a.lastNameTh,
      [a.titleEn, a.firstNameEn, a.lastNameEn].filter(Boolean).join(" "), a.birthDate, a.nationalIdLast4, a.phone, a.email,
      a.addressLine, a.subdistrict, a.district, a.province, a.postalCode, ed.level, ed.institution, ed.qualification, oc.occupation, oc.organization,
      g.name, g.relation, g.phone, docs, VERIFY_TH[r.verification_status] ?? r.verification_status, PAY_TH[r.payment_status] ?? r.payment_status,
      r.receipt_no, r.staff_note, r.declaration_name,
    ];
  });
  await audit(ctx().db, { action: "course.applications_exported", userId: manager.id, entityType: "course", entityId: course.id, ip: meta.ip, details: { rows: rows.length } });
  const csv = "﻿" + [header, ...body].map((row) => row.map(cell).join(",")).join("\r\n");
  return { csv, filename: `applications-${bangkokDate(new Date())}.csv`, rows: rows.length };
}
