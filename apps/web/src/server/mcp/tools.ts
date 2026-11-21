/**
 * MCP tool registry: every tool declares the minimum role that may call it, so the exact
 * set of tools an MCP client sees (and can call) depends on the user's permissions.
 * All tools are read-only by design — MCP here is for automation and queries.
 */
import "server-only";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { verifyPublicCertificate } from "../certificates/verify.service";

export type McpRole = "member" | "instructor" | "admin";

export interface McpUser {
  id: string;
  role: McpRole;
  isSystemOwner: boolean;
  email: string;
  username: string | null;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  minRole: McpRole;
  run: (user: McpUser, args: Record<string, unknown>) => Promise<unknown>;
}

const str = (v: unknown, max = 255): string => String(v ?? "").trim().slice(0, max);
const int = (v: unknown, fallback: number, max: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), max);
};

const courseRow = (c: { id: string; slug: string; title: string; description: string | null; is_verified_course: boolean; total_duration_sec: number; published_at: Date | null }) => ({
  id: c.id,
  slug: c.slug,
  title: c.title,
  description: c.description ?? "",
  verifiedCourse: c.is_verified_course,
  totalDurationSec: c.total_duration_sec,
  publishedAt: c.published_at?.toISOString() ?? null,
});

export const MCP_TOOLS: McpTool[] = [
  // ── member ──────────────────────────────────────────────────────────────────────────
  {
    name: "whoami",
    description: "ข้อมูลผู้ใช้ที่เชื่อมต่อ MCP อยู่ (อีเมล บทบาท สิทธิ์)",
    inputSchema: { type: "object", properties: {} },
    minRole: "member",
    run: async (user) => ({ id: user.id, email: user.email, username: user.username, role: user.role, isSystemOwner: user.isSystemOwner }),
  },
  {
    name: "list_published_courses",
    description: "ค้นหาหลักสูตรที่เผยแพร่แล้ว (ค้นตามชื่อ)",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } } },
    minRole: "member",
    run: async (_user, args) => {
      const rows = await ctx()
        .db.selectFrom("courses")
        .select(["id", "slug", "title", "description", "is_verified_course", "total_duration_sec", "published_at"])
        .where("visibility", "=", "published")
        .$if(Boolean(str(args.query)), (q) => q.where("title", "ilike", `%${str(args.query)}%`))
        .orderBy("published_at", "desc")
        .limit(int(args.limit, 20, 100))
        .execute();
      return { courses: rows.map(courseRow) };
    },
  },
  {
    name: "get_course",
    description: "ข้อมูลหลักสูตรจาก slug (เฉพาะที่เผยแพร่)",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
    minRole: "member",
    run: async (_user, args) => {
      const c = await ctx()
        .db.selectFrom("courses")
        .select(["id", "slug", "title", "description", "is_verified_course", "total_duration_sec", "published_at"])
        .where("slug", "=", str(args.slug))
        .where("visibility", "=", "published")
        .executeTakeFirst();
      if (!c) return { error: "NOT_FOUND" };
      const lessons = await ctx()
        .db.selectFrom("lessons")
        .select(["id", "sequence_order", "title", "duration_sec"])
        .where("course_id", "=", c.id)
        .orderBy("sequence_order")
        .execute();
      return { ...courseRow(c), lessons: lessons.map((l) => ({ id: l.id, order: l.sequence_order, title: l.title, durationSec: l.duration_sec })) };
    },
  },
  {
    name: "my_enrollments",
    description: "หลักสูตรที่ฉันลงทะเบียนพร้อมความคืบหน้า",
    inputSchema: { type: "object", properties: {} },
    minRole: "member",
    run: async (user) => {
      const rows = await ctx()
        .db.selectFrom("enrollments as e")
        .innerJoin("courses as c", "c.id", "e.course_id")
        .select([
          "e.id", "e.status", "e.enrolled_at", "e.completed_at", "c.id as course_id", "c.slug", "c.title",
          sql<number>`(select coalesce(sum(accumulated_valid_sec), 0)::int from lesson_progress p where p.enrollment_id = e.id)`.as("study_sec"),
          sql<number>`(select count(*)::int from lesson_progress p where p.enrollment_id = e.id and p.is_completed)`.as("lessons_done"),
          sql<number>`(select count(*)::int from lessons l where l.course_id = c.id)`.as("lessons_total"),
        ])
        .where("e.user_id", "=", user.id)
        .orderBy("e.enrolled_at", "desc")
        .execute();
      return { enrollments: rows };
    },
  },
  {
    name: "my_certificates",
    description: "วุฒิบัตรของฉัน (รหัส สถานะ วันออก)",
    inputSchema: { type: "object", properties: {} },
    minRole: "member",
    run: async (user) => ({
      certificates: await ctx()
        .db.selectFrom("certificates")
        .select(["certificate_code", "document_name_snapshot", "course_title_snapshot", "issued_at", "revoked_at", "expires_at"])
        .where("user_id", "=", user.id)
        .orderBy("issued_at", "desc")
        .execute(),
    }),
  },
  {
    name: "my_cohort_registrations",
    description: "รอบอบรมที่ฉันสมัครพร้อมสถานะ",
    inputSchema: { type: "object", properties: {} },
    minRole: "member",
    run: async (user) => ({
      registrations: await ctx()
        .db.selectFrom("cohort_registrations as r")
        .innerJoin("program_cohorts as c", "c.id", "r.cohort_id")
        .innerJoin("programs as p", "p.id", "c.program_id")
        .select(["r.status", "r.applied_at", "r.decided_at", "c.id as cohort_id", "c.title as cohort_title", "p.title as program_title", "p.slug as program_slug"])
        .where("r.user_id", "=", user.id)
        .orderBy("r.applied_at", "desc")
        .execute(),
    }),
  },
  {
    name: "verify_certificate",
    description: "ตรวจสอบวุฒิบัตรสาธารณะจากรหัส (valid/revoked/expired/tampered)",
    inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    minRole: "member",
    run: async (_user, args) => verifyPublicCertificate(str(args.code)),
  },

  // ── instructor ──────────────────────────────────────────────────────────────────────
  {
    name: "list_taught_courses",
    description: "หลักสูตรที่ฉันสอน (แอดมินเห็นทุกหลักสูตร)",
    inputSchema: { type: "object", properties: {} },
    minRole: "instructor",
    run: async (user) => {
      const rows = await ctx()
        .db.selectFrom("courses")
        .select(["id", "slug", "title", "description", "visibility", "is_verified_course", "total_duration_sec", "published_at"])
        .$if(user.role !== "admin", (q) => q.where("instructor_id", "=", user.id))
        .orderBy("created_at", "desc")
        .limit(200)
        .execute();
      return { courses: rows.map((c) => ({ ...courseRow(c), visibility: c.visibility })) };
    },
  },
  {
    name: "course_overview",
    description: "สถิติผู้เรียนของหลักสูตรที่ฉันสอน (จำนวนผู้เรียน จบแล้ว คะแนนเฉลี่ย)",
    inputSchema: { type: "object", properties: { courseId: { type: "string" } }, required: ["courseId"] },
    minRole: "instructor",
    run: async (user, args) => {
      const courseId = str(args.courseId, 64);
      const owned = await ctx()
        .db.selectFrom("courses")
        .select(["id", "title", "instructor_id"])
        .where("id", "=", courseId)
        .$if(user.role !== "admin", (q) => q.where("instructor_id", "=", user.id))
        .executeTakeFirst();
      if (!owned) return { error: "FORBIDDEN" };
      const stats = await ctx()
        .db.selectNoFrom([
          sql<number>`(select count(*)::int from enrollments where course_id = ${courseId})`.as("enrolled"),
          sql<number>`(select count(*)::int from enrollments where course_id = ${courseId} and status = 'completed')`.as("completed"),
          sql<number>`(select count(*)::int from enrollments where course_id = ${courseId} and status = 'in_progress')`.as("inProgress"),
          sql<number>`(select coalesce(round(avg(score_percentage), 2), 0)::float from quiz_attempts a join enrollments e on e.id = a.enrollment_id where e.course_id = ${courseId} and a.assessment_type = 'post' and a.is_passed)`.as("avgScore"),
        ])
        .executeTakeFirstOrThrow();
      return { courseId, title: owned.title, ...stats };
    },
  },
  {
    name: "course_students",
    description: "รายชื่อผู้เรียนและความคืบหน้าของหลักสูตรที่ฉันสอน",
    inputSchema: { type: "object", properties: { courseId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 500 } } },
    minRole: "instructor",
    run: async (user, args) => {
      const courseId = str(args.courseId, 64);
      const owned = await ctx()
        .db.selectFrom("courses")
        .select(["id"])
        .where("id", "=", courseId)
        .$if(user.role !== "admin", (q) => q.where("instructor_id", "=", user.id))
        .executeTakeFirst();
      if (!owned) return { error: "FORBIDDEN" };
      const rows = await ctx()
        .db.selectFrom("enrollments as e")
        .innerJoin("users as u", "u.id", "e.user_id")
        .select([
          "e.id", "e.status", "e.enrolled_at", "e.completed_at", "u.id as user_id", "u.email",
          sql<string | null>`coalesce(u.legal_full_name_th, u.legal_full_name_en)`.as("name"),
          sql<number>`(select coalesce(sum(accumulated_valid_sec), 0)::int from lesson_progress p where p.enrollment_id = e.id)`.as("study_sec"),
          sql<number>`(select count(*)::int from lesson_progress p where p.enrollment_id = e.id and p.is_completed)`.as("lessons_done"),
        ])
        .where("e.course_id", "=", courseId)
        .orderBy("e.enrolled_at")
        .limit(int(args.limit, 100, 500))
        .execute();
      return { students: rows };
    },
  },

  // ── admin ───────────────────────────────────────────────────────────────────────────
  {
    name: "admin_stats",
    description: "ภาพรวมระบบ (ผู้ใช้ หลักสูตร การลงทะเบียน วุฒิบัตร อีเมล แฟล็กกันโกง)",
    inputSchema: { type: "object", properties: {} },
    minRole: "admin",
    run: async () => {
      const stats = await ctx()
        .db.selectNoFrom([
          sql<number>`(select count(*)::int from users where deleted_at is null)`.as("users"),
          sql<number>`(select count(*)::int from courses where visibility = 'published')`.as("publishedCourses"),
          sql<number>`(select count(*)::int from enrollments)`.as("enrollments"),
          sql<number>`(select count(*)::int from certificates where revoked_at is null)`.as("certificates"),
          sql<number>`(select count(*)::int from programs where visibility = 'published')`.as("publishedPrograms"),
          sql<number>`(select count(*)::int from program_cohorts where status = 'published' and registration_opens_at <= now() and registration_closes_at > now())`.as("openCohorts"),
          sql<number>`(select count(*)::int from cohort_registrations r join program_cohorts c on c.id = r.cohort_id where r.status = 'pending' and c.status = 'published')`.as("pendingRegistrations"),
          sql<number>`(select count(*)::int from anticheat_events where created_at > now() - interval '7 days')`.as("anticheatFlags7d"),
          sql<number>`(select count(*)::int from email_outbox where status in ('pending','processing'))`.as("emailPending"),
          sql<number>`(select count(*)::int from email_outbox where status = 'failed')`.as("emailFailed"),
        ])
        .executeTakeFirstOrThrow();
      return stats;
    },
  },
  {
    name: "list_users",
    description: "ค้นหาผู้ใช้ (อีเมลหรือชื่อ) พร้อมบทบาทและสถานะ",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200 } } },
    minRole: "admin",
    run: async (_user, args) => {
      const rows = await ctx()
        .db.selectFrom("users")
        .select(["id", "email", "username", "role", "status", "created_at", "deleted_at", "legal_full_name_th", "legal_full_name_en"])
        .$if(Boolean(str(args.query)), (q) =>
          q.where((eb) => eb.or([eb("email", "ilike", `%${str(args.query)}%`), eb("legal_full_name_th", "ilike", `%${str(args.query)}%`), eb("legal_full_name_en", "ilike", `%${str(args.query)}%`)])),
        )
        .orderBy("created_at", "desc")
        .limit(int(args.limit, 50, 200))
        .execute();
      return { users: rows.map((u) => ({ id: u.id, email: u.email, username: u.username, role: u.role, status: u.status, name: u.legal_full_name_th ?? u.legal_full_name_en ?? null, createdAt: u.created_at.toISOString(), deletedAt: u.deleted_at?.toISOString() ?? null })) };
    },
  },
  {
    name: "list_cohorts",
    description: "รอบอบรมของหลักสูตรอบรมพร้อมจำนวนผู้สมัคร",
    inputSchema: { type: "object", properties: { programId: { type: "string" } } },
    minRole: "admin",
    run: async (_user, args) => {
      const rows = await ctx()
        .db.selectFrom("program_cohorts as c")
        .innerJoin("programs as p", "p.id", "c.program_id")
        .select([
          "c.id", "c.title", "c.status", "c.capacity", "c.registration_opens_at", "c.registration_closes_at", "c.starts_at", "c.ends_at",
          "p.id as program_id", "p.title as program_title",
          sql<number>`(select count(*)::int from cohort_registrations r where r.cohort_id = c.id and r.status = 'approved')`.as("approved"),
          sql<number>`(select count(*)::int from cohort_registrations r where r.cohort_id = c.id and r.status = 'pending')`.as("pending"),
          sql<number>`(select count(*)::int from cohort_registrations r where r.cohort_id = c.id and r.status = 'waitlisted')`.as("waitlisted"),
        ])
        .$if(Boolean(str(args.programId, 64)), (q) => q.where("c.program_id", "=", str(args.programId, 64)))
        .orderBy("c.starts_at", "desc")
        .limit(200)
        .execute();
      return { cohorts: rows };
    },
  },
  {
    name: "list_announcements",
    description: "ประกาศประชาสัมพันธ์ (รวมฉบับร่างสำหรับผู้ดูแล)",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
    minRole: "admin",
    run: async (_user, args) => ({
      announcements: await ctx()
        .db.selectFrom("announcements")
        .select(["id", "slug", "title", "kind", "visibility", "is_pinned", "publish_at", "expires_at"])
        .orderBy("publish_at", "desc")
        .limit(int(args.limit, 20, 100))
        .execute(),
    }),
  },
  {
    name: "recent_anticheat_flags",
    description: "เหตุการณ์กันโกงล่าสุดพร้อมเหตุผล",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200 } } },
    minRole: "admin",
    run: async (_user, args) => ({
      flags: await ctx()
        .db.selectFrom("anticheat_events as a")
        .innerJoin("users as u", "u.id", "a.user_id")
        .select(["a.id", "a.reason", "a.created_at", "u.id as user_id", "u.email", "a.lesson_id"])
        .orderBy("a.created_at", "desc")
        .limit(int(args.limit, 50, 200))
        .execute(),
    }),
  },
];
