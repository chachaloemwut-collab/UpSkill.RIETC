/**
 * Admin trainee reports (read-only): who enrolled in which course, progress, completion and วุฒิบัตร.
 * Used by the /admin/reports page (table, PNG, print) and the CSV export. Never writes anything;
 * exports are audited by the route. National ID, birth date and address are deliberately not included.
 */
import "server-only";
import { sql } from "@upskill/db";
import { ctx } from "../context";

export const REPORT_STATUSES = ["in_progress", "completed", "certified", "completed_no_cert", "revoked"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface TraineeReportFilter {
  courseId?: string | undefined;
  status?: ReportStatus | undefined;
  /** yyyy-mm-dd, inclusive, Asia/Bangkok, on the enrollment date */
  from?: string | undefined;
  to?: string | undefined;
  q?: string | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseReportFilter(sp: URLSearchParams | Record<string, string | undefined>): TraineeReportFilter {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) : sp[k]) ?? undefined;
  const status = get("status");
  const courseId = get("course");
  const from = get("from");
  const to = get("to");
  const q = get("q")?.trim().slice(0, 100);
  return {
    courseId: courseId && UUID.test(courseId) ? courseId : undefined,
    status: (REPORT_STATUSES as readonly string[]).includes(status ?? "") ? (status as ReportStatus) : undefined,
    from: from && DAY.test(from) ? from : undefined,
    to: to && DAY.test(to) ? to : undefined,
    q: q || undefined,
  };
}

export async function listTrainees(f: TraineeReportFilter, limit = 20_000) {
  const { db } = ctx();
  let q = db
    .selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .innerJoin("users as u", "u.id", "e.user_id")
    .leftJoin("user_profiles as p", "p.user_id", "u.id")
    .leftJoin("certificates as cert", "cert.enrollment_id", "e.id")
    .select([
      "e.id as enrollment_id",
      "e.status",
      "e.enrolled_at",
      "e.completed_at",
      "c.id as course_id",
      "c.title as course_title",
      "u.id as user_id",
      "u.email",
      "u.legal_full_name_th",
      "p.title_th",
      "p.first_name_th",
      "p.last_name_th",
      "p.phone",
      "p.province",
      "cert.certificate_code",
      "cert.issued_at",
      "cert.revoked_at as certificate_revoked_at",
      sql<number>`(select coalesce(sum(lp.accumulated_valid_sec), 0)::int from lesson_progress lp where lp.enrollment_id = e.id)`.as("study_sec"),
      sql<number>`(select count(*)::int from lesson_progress lp where lp.enrollment_id = e.id and lp.is_completed)`.as("lessons_done"),
      sql<number>`(select count(*)::int from lessons l where l.course_id = c.id)`.as("lessons_total"),
    ])
    .where("u.deleted_at", "is", null);

  if (f.courseId) q = q.where("e.course_id", "=", f.courseId);
  if (f.status === "in_progress") q = q.where("e.status", "=", "in_progress");
  if (f.status === "completed") q = q.where("e.status", "=", "completed");
  if (f.status === "revoked") q = q.where("e.status", "=", "revoked");
  if (f.status === "certified") q = q.where("cert.certificate_code", "is not", null).where("cert.revoked_at", "is", null);
  if (f.status === "completed_no_cert") q = q.where("e.status", "=", "completed").where("cert.certificate_code", "is", null);
  if (f.from) q = q.where(sql<boolean>`(e.enrolled_at at time zone 'Asia/Bangkok')::date >= ${f.from}::date`);
  if (f.to) q = q.where(sql<boolean>`(e.enrolled_at at time zone 'Asia/Bangkok')::date <= ${f.to}::date`);
  if (f.q) {
    const like = `%${f.q}%`;
    q = q.where((eb) =>
      eb.or([
        eb("u.email", "ilike", like),
        eb("u.legal_full_name_th", "ilike", like),
        eb("p.first_name_th", "ilike", like),
        eb("p.last_name_th", "ilike", like),
        eb("p.phone", "ilike", like),
        eb("cert.certificate_code", "ilike", like),
      ]),
    );
  }

  const rows = await q.orderBy("c.title").orderBy("e.enrolled_at", "desc").limit(limit).execute();
  return rows.map((r) => ({
    ...r,
    // Thai convention: the title is written attached to the first name ("นายสมชาย ใจดี")
    name: r.legal_full_name_th || (r.first_name_th ? `${r.title_th ?? ""}${r.first_name_th} ${r.last_name_th ?? ""}`.trim() : r.email),
  }));
}

export type TraineeRow = Awaited<ReturnType<typeof listTrainees>>[number];

/** One line per course: enrolment funnel for the same filters (status/search ignored so the funnel is complete). */
export async function courseSummary(f: TraineeReportFilter) {
  const { db } = ctx();
  let q = db
    .selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .innerJoin("users as u", "u.id", "e.user_id")
    .leftJoin("certificates as cert", "cert.enrollment_id", "e.id")
    .select([
      "c.id as course_id",
      "c.title as course_title",
      sql<number>`count(*)::int`.as("enrolled"),
      sql<number>`count(*) filter (where e.status = 'in_progress')::int`.as("in_progress"),
      sql<number>`count(*) filter (where e.status = 'completed')::int`.as("completed"),
      sql<number>`count(cert.certificate_code) filter (where cert.revoked_at is null)::int`.as("certified"),
    ])
    .where("u.deleted_at", "is", null)
    .groupBy(["c.id", "c.title"]);
  if (f.courseId) q = q.where("e.course_id", "=", f.courseId);
  if (f.from) q = q.where(sql<boolean>`(e.enrolled_at at time zone 'Asia/Bangkok')::date >= ${f.from}::date`);
  if (f.to) q = q.where(sql<boolean>`(e.enrolled_at at time zone 'Asia/Bangkok')::date <= ${f.to}::date`);
  return q.orderBy("c.title").execute();
}

export async function listReportCourses() {
  return ctx().db.selectFrom("courses").select(["id", "title"]).where("visibility", "!=", "draft").orderBy("title").execute();
}
