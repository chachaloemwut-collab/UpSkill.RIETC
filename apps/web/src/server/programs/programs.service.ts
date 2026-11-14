/**
 * Training programs (a curated, ordered set of courses) managed by admins, and their public pages.
 * Every admin function is called from routes declared with roles: ["admin"]; the role is checked again here
 * so a future caller can't forget it.
 */
import "server-only";
import { deriveCohortPhase, describeRules, evaluateEligibility, parseEligibilityRules, programPublishProblems, seatsLeft, type CohortPhase } from "@upskill/core";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { HttpError } from "../http";
import { audit } from "../audit";
import { slugify } from "../slug";
import type { CurrentUser } from "../auth/session";
import { applicantProfile, seatsTaken } from "./cohorts.service";
import { assertAdmin, cohortTimeline } from "./shared";

export type ProgramVisibility = "draft" | "published" | "unlisted" | "archived";

const coverVideo = sql<string | null>`(
  select l.youtube_video_id from program_courses pc
  join lessons l on l.course_id = pc.course_id
  where pc.program_id = p.id
  order by pc.sequence_order, l.sequence_order limit 1)`;

// ---------------------------------------------------------------- admin

export async function listProgramsAdmin(user: CurrentUser) {
  assertAdmin(user);
  return ctx()
    .db.selectFrom("programs as p")
    .select([
      "p.id", "p.slug", "p.title", "p.category", "p.visibility", "p.updated_at",
      sql<number>`(select count(*)::int from program_courses pc where pc.program_id = p.id)`.as("course_count"),
      sql<number>`(select count(*)::int from program_cohorts c where c.program_id = p.id and c.status <> 'cancelled')`.as("cohort_count"),
      sql<number>`(select count(*)::int from cohort_registrations r join program_cohorts c on c.id = r.cohort_id where c.program_id = p.id and r.status = 'pending')`.as("pending_count"),
      sql<Date | null>`(select min(c.starts_at) from program_cohorts c where c.program_id = p.id and c.status = 'published' and c.ends_at > now())`.as("next_start"),
      coverVideo.as("cover_video_id"),
    ])
    .orderBy("p.updated_at", "desc")
    .limit(500)
    .execute();
}

export async function createProgram(user: CurrentUser, input: { title: string; summary?: string | undefined; category?: string | undefined }, meta: { ip: string }) {
  assertAdmin(user);
  const { db } = ctx();
  const p = await db
    .insertInto("programs")
    .values({ title: input.title.trim(), summary: input.summary?.trim() || null, category: input.category?.trim() || null, slug: slugify(input.title, "program"), created_by: user.id })
    .returning(["id", "slug"])
    .executeTakeFirstOrThrow();
  await audit(db, { action: "program.created", userId: user.id, entityType: "program", entityId: p.id, ip: meta.ip });
  return p;
}

async function loadProgram(programId: string) {
  const p = await ctx().db.selectFrom("programs").selectAll().where("id", "=", programId).executeTakeFirst();
  if (!p) throw new HttpError(404, "NOT_FOUND");
  return p;
}

async function programCourses(programId: string) {
  return ctx()
    .db.selectFrom("program_courses as pc")
    .innerJoin("courses as c", "c.id", "pc.course_id")
    .innerJoin("users as u", "u.id", "c.instructor_id")
    .select([
      "c.id", "c.slug", "c.title", "c.description", "c.visibility", "c.total_duration_sec", "c.instructor_id", "pc.sequence_order", "pc.is_required",
      sql<string>`coalesce(u.legal_full_name_th, u.legal_full_name_en, split_part(u.email, '@', 1))`.as("instructor_name"),
      sql<number>`(select count(*)::int from lessons l where l.course_id = c.id)`.as("lesson_count"),
      sql<number>`(select count(*)::int from lessons l where l.course_id = c.id and l.video_status <> 'active')`.as("broken_count"),
    ])
    .where("pc.program_id", "=", programId)
    .orderBy("pc.sequence_order")
    .execute();
}

export async function getProgramForAdmin(user: CurrentUser, programId: string) {
  assertAdmin(user);
  const { db } = ctx();
  const program = await loadProgram(programId);
  const [courses, cohorts, allCourses, groups] = await Promise.all([
    programCourses(programId),
    db
      .selectFrom("program_cohorts as c")
      .selectAll("c")
      .select([
        sql<number>`(select count(*)::int from cohort_registrations r where r.cohort_id = c.id and r.status = 'pending')`.as("pending_count"),
        sql<number>`(select count(*)::int from cohort_registrations r where r.cohort_id = c.id and r.status = 'approved')`.as("approved_count"),
        sql<number>`(select count(*)::int from cohort_registrations r where r.cohort_id = c.id and r.status = 'waitlisted')`.as("waitlisted_count"),
      ])
      .where("c.program_id", "=", programId)
      .orderBy("c.starts_at", "desc")
      .execute(),
    db
      .selectFrom("courses as c")
      .innerJoin("users as u", "u.id", "c.instructor_id")
      .select(["c.id", "c.title", "c.visibility", sql<string>`coalesce(u.legal_full_name_th, u.legal_full_name_en, split_part(u.email, '@', 1))`.as("instructor_name")])
      .where("c.visibility", "<>", "suspended")
      .orderBy("c.title")
      .limit(1000)
      .execute(),
    db.selectFrom("learning_groups").select(["id", "name"]).orderBy("name").limit(500).execute(),
  ]);
  const now = new Date();
  return {
    program,
    courses,
    cohorts: cohorts.map((c) => ({ ...c, phase: deriveCohortPhase(cohortTimeline(c), now) })),
    allCourses,
    groups,
    publishProblems: programPublishProblems({
      title: program.title,
      summary: program.summary,
      courses: courses.map((c) => ({ title: c.title, visibility: c.visibility, lessons: c.lesson_count, brokenLessons: c.broken_count })),
    }),
  };
}

export async function updateProgram(
  user: CurrentUser,
  programId: string,
  patch: Partial<{ title: string; summary: string | null; description: string | null; category: string | null }>,
) {
  assertAdmin(user);
  await loadProgram(programId);
  const set = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === "string" ? v.trim() || (k === "title" ? v : null) : v]));
  if (Object.keys(set).length === 0) return;
  await ctx().db.updateTable("programs").set(set).where("id", "=", programId).execute();
}

/** Replace the program's course list (order = array order). Uses the deferrable unique order constraint. */
export async function setProgramCourses(user: CurrentUser, programId: string, items: Array<{ courseId: string; isRequired: boolean }>) {
  assertAdmin(user);
  await loadProgram(programId);
  const ids = items.map((i) => i.courseId);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "DUPLICATE_COURSE");
  const { db } = ctx();
  if (ids.length) {
    const found = await db.selectFrom("courses").select("id").where("id", "in", ids).execute();
    if (found.length !== ids.length) throw new HttpError(404, "NOT_FOUND");
  }
  await db.transaction().execute(async (trx) => {
    await trx.selectFrom("programs").select("id").where("id", "=", programId).forUpdate().execute();
    await sql`SET CONSTRAINTS uq_program_courses_order DEFERRED`.execute(trx);
    await trx.deleteFrom("program_courses").where("program_id", "=", programId).execute();
    if (items.length) {
      await trx
        .insertInto("program_courses")
        .values(items.map((i, n) => ({ program_id: programId, course_id: i.courseId, sequence_order: n + 1, is_required: i.isRequired })))
        .execute();
    }
  });
}

export async function setProgramVisibility(user: CurrentUser, programId: string, visibility: ProgramVisibility, meta: { ip: string }) {
  assertAdmin(user);
  const program = await loadProgram(programId);
  const { db } = ctx();
  if (visibility === "published" || visibility === "unlisted") {
    const courses = await programCourses(programId);
    const problems = programPublishProblems({
      title: program.title,
      summary: program.summary,
      courses: courses.map((c) => ({ title: c.title, visibility: c.visibility, lessons: c.lesson_count, brokenLessons: c.broken_count })),
    });
    if (problems.length) throw new HttpError(422, "PUBLISH_REQUIREMENTS_NOT_MET", problems.join(" · "));
  }
  await db
    .updateTable("programs")
    .set({ visibility, ...(visibility === "published" ? { published_at: sql<Date>`coalesce(published_at, now())` } : {}) })
    .where("id", "=", programId)
    .execute();
  await audit(db, {
    action: visibility === "published" ? "program.published" : "program.visibility_changed",
    userId: user.id,
    entityType: "program",
    entityId: programId,
    ip: meta.ip,
    details: { from: program.visibility, to: visibility },
  });
}

/** Hard delete only while nobody has applied; otherwise archive it */
export async function deleteProgram(user: CurrentUser, programId: string, meta: { ip: string }) {
  assertAdmin(user);
  await loadProgram(programId);
  const { db } = ctx();
  const used = await db
    .selectFrom("cohort_registrations as r")
    .innerJoin("program_cohorts as c", "c.id", "r.cohort_id")
    .select(sql<number>`count(*)::int`.as("n"))
    .where("c.program_id", "=", programId)
    .executeTakeFirstOrThrow();
  if (used.n > 0) throw new HttpError(409, "PROGRAM_HAS_REGISTRATIONS", "หลักสูตรมีผู้สมัครแล้ว ใช้การเก็บเข้าคลัง (archive) แทนการลบ");
  await db.deleteFrom("programs").where("id", "=", programId).execute();
  await audit(db, { action: "program.deleted", userId: user.id, entityType: "program", entityId: programId, ip: meta.ip });
}

// ---------------------------------------------------------------- public

const PHASE_RANK: Record<CohortPhase, number> = { open: 0, scheduled: 1, closed: 2, in_progress: 3, completed: 4, cancelled: 5, draft: 6 };

/** Published programs for the catalog, each with the cohort a visitor cares about most (open > upcoming > ...) */
export async function listPublishedPrograms() {
  const { db } = ctx();
  const programs = await db
    .selectFrom("programs as p")
    .select([
      "p.id", "p.slug", "p.title", "p.summary", "p.category", "p.published_at",
      sql<number>`(select count(*)::int from program_courses pc where pc.program_id = p.id)`.as("course_count"),
      sql<number>`(select coalesce(sum(c.total_duration_sec), 0)::int from program_courses pc join courses c on c.id = pc.course_id where pc.program_id = p.id)`.as("total_duration_sec"),
      coverVideo.as("cover_video_id"),
    ])
    .where("p.visibility", "=", "published")
    .orderBy("p.published_at", "desc")
    .limit(200)
    .execute();
  if (programs.length === 0) return [];
  const cohorts = await db
    .selectFrom("program_cohorts")
    .select(["id", "program_id", "title", "status", "registration_opens_at", "registration_closes_at", "starts_at", "ends_at", "capacity"])
    .where("program_id", "in", programs.map((p) => p.id))
    .where("status", "=", "published")
    .execute();
  const now = new Date();
  return programs.map((p) => {
    const mine = cohorts
      .filter((c) => c.program_id === p.id)
      .map((c) => ({ ...c, phase: deriveCohortPhase(cohortTimeline(c), now) }))
      .sort((a, b) => PHASE_RANK[a.phase] - PHASE_RANK[b.phase] || a.starts_at.getTime() - b.starts_at.getTime());
    const next = mine[0] ?? null;
    return {
      ...p,
      nextCohort: next && { id: next.id, title: next.title, phase: next.phase, registrationOpensAt: next.registration_opens_at, registrationClosesAt: next.registration_closes_at, startsAt: next.starts_at, endsAt: next.ends_at },
    };
  });
}

/** Cohorts that are open now or open soon, for the landing page "upcoming" section */
export async function listUpcomingCohorts(limit = 3) {
  const rows = await ctx()
    .db.selectFrom("program_cohorts as c")
    .innerJoin("programs as p", "p.id", "c.program_id")
    .select([
      "c.id", "c.title", "c.status", "c.registration_opens_at", "c.registration_closes_at", "c.starts_at", "c.ends_at", "c.capacity",
      "p.slug as program_slug", "p.title as program_title", "p.summary as program_summary",
      coverVideo.as("cover_video_id"),
    ])
    .where("c.status", "=", "published")
    .where("p.visibility", "=", "published")
    .where("c.registration_closes_at", ">", new Date())
    .orderBy("c.registration_opens_at")
    .limit(limit)
    .execute();
  const now = new Date();
  return rows.map((r) => ({ ...r, phase: deriveCohortPhase(cohortTimeline(r), now) }));
}

/** Program page. null = render 404 (draft/archived programs are visible to admins only). */
export async function getProgramForViewer(slug: string, user: CurrentUser | null) {
  const { db } = ctx();
  const program = await db.selectFrom("programs").selectAll().where("slug", "=", slug).executeTakeFirst();
  if (!program) return null;
  const isAdmin = user?.role === "admin";
  if (!isAdmin && program.visibility !== "published" && program.visibility !== "unlisted") return null;

  const courses = await programCourses(program.id);
  const cohortRows = await db
    .selectFrom("program_cohorts")
    .selectAll()
    .where("program_id", "=", program.id)
    .$if(!isAdmin, (q) => q.where("status", "in", ["published", "cancelled"]))
    .orderBy("starts_at", "desc")
    .execute();
  const registrations = user && cohortRows.length
    ? await db
        .selectFrom("cohort_registrations")
        .select(["cohort_id", "status", "applied_at", "decision_note"])
        .where("user_id", "=", user.id)
        .where("cohort_id", "in", cohortRows.map((c) => c.id))
        .execute()
    : [];

  // Names used to describe rules to applicants
  const allRules = cohortRows.map((c) => parseEligibilityRules(c.eligibility));
  const groupIds = [...new Set(allRules.flatMap((r) => r.groupIds))];
  const prereqIds = [...new Set(allRules.flatMap((r) => r.prerequisiteCourseIds))];
  const [groups, prereqs] = await Promise.all([
    groupIds.length ? db.selectFrom("learning_groups").select(["id", "name"]).where("id", "in", groupIds).execute() : [],
    prereqIds.length ? db.selectFrom("courses").select(["id", "title"]).where("id", "in", prereqIds).execute() : [],
  ]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  const courseTitles = Object.fromEntries(prereqs.map((c) => [c.id, c.title]));
  const profile = user ? await applicantProfile(user) : null;
  const now = new Date();
  const instructorOfProgram = !!user && courses.some((c) => c.instructor_id === user.id);

  const cohorts = await Promise.all(
    cohortRows.map(async (c, i) => {
      const rules = allRules[i]!;
      const phase = deriveCohortPhase(cohortTimeline(c), now);
      const taken = await seatsTaken(db, c.id);
      const mine = registrations.find((r) => r.cohort_id === c.id) ?? null;
      return {
        id: c.id,
        title: c.title,
        status: c.status,
        phase,
        registrationOpensAt: c.registration_opens_at,
        registrationClosesAt: c.registration_closes_at,
        startsAt: c.starts_at,
        endsAt: c.ends_at,
        capacity: c.capacity,
        seatsLeft: seatsLeft({ capacity: c.capacity, taken }),
        waitlistEnabled: c.waitlist_enabled,
        requiresApproval: c.requires_approval,
        requirements: describeRules(rules, groupNames, courseTitles),
        applicationForm: rules.applicationForm,
        myRegistration: mine && { status: mine.status, appliedAt: mine.applied_at, note: mine.decision_note },
        // Shown before the applicant presses "apply", so they know why they can't
        ineligibleReasons: profile && phase === "open" && !mine ? evaluateEligibility(rules, profile, courseTitles).map((r) => r.message) : [],
      };
    }),
  );

  return {
    program,
    // instructor ids stay on the server; the page only needs names
    courses: courses.map((c) => ({ id: c.id, slug: c.slug, title: c.title, total_duration_sec: c.total_duration_sec, lesson_count: c.lesson_count, instructor_name: c.instructor_name, is_required: c.is_required })),
    cohorts,
    isAdmin,
    instructorOfProgram,
  };
}

/** Programs that include a course (shown on the course page, and used to gate direct enrollment) */
export async function programsForCourse(courseId: string) {
  return ctx()
    .db.selectFrom("program_courses as pc")
    .innerJoin("programs as p", "p.id", "pc.program_id")
    .select(["p.id", "p.slug", "p.title", "p.visibility"])
    .where("pc.course_id", "=", courseId)
    .where("p.visibility", "in", ["published", "unlisted"])
    .execute();
}
