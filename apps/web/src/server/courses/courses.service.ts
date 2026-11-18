/** Public course catalog, course detail with the viewer's progress, enrollment. */
import "server-only";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { addEmailToOutbox } from "../email/outbox.service";
import { HttpError } from "../http";
import type { CurrentUser } from "../auth/session";
import { programsForCourse } from "../programs/programs.service";
import { assertProfileComplete } from "../auth/profile.service";
import { lessonTestSatisfied, summarizeLessonTests } from "@upskill/core";
import { asCompletionRule } from "./completion.service";
import { asNavigationMode } from "../learning/heartbeat.service";

const NO_ID = "00000000-0000-0000-0000-000000000000";

export async function listPublishedCourses() {
  return ctx()
    .db.selectFrom("courses as c")
    .innerJoin("users as u", "u.id", "c.instructor_id")
    .select([
      "c.id", "c.slug", "c.title", "c.description", "c.thumbnail_url", "c.is_verified_course", "c.total_duration_sec",
      sql<string>`coalesce(u.legal_full_name_th, u.legal_full_name_en, split_part(u.email, '@', 1))`.as("instructor_name"),
      sql<number>`(select count(*)::int from lessons l where l.course_id = c.id)`.as("lesson_count"),
      sql<number>`(select count(*)::int from enrollments e where e.course_id = c.id)`.as("learner_count"),
      sql<string | null>`(select l.youtube_video_id from lessons l where l.course_id = c.id order by l.sequence_order limit 1)`.as("cover_video_id"),
    ])
    .where("c.visibility", "=", "published")
    .orderBy("c.published_at", "desc")
    .limit(100)
    .execute();
}

export function canManageCourse(user: CurrentUser | null, instructorId: string): boolean {
  return !!user && (user.role === "admin" || user.id === instructorId);
}

/** Returns null when the viewer may not see the course (draft/suspended for non-owners): render as 404 */
export async function getCourseForViewer(slug: string, user: CurrentUser | null) {
  const { db } = ctx();
  const course = await db
    .selectFrom("courses as c")
    .innerJoin("users as u", "u.id", "c.instructor_id")
    .select([
      "c.id", "c.slug", "c.title", "c.description", "c.visibility", "c.instructor_id", "c.is_verified_course",
      "c.min_watch_percentage", "c.passing_quiz_score", "c.is_sequential_locked", "c.total_duration_sec",
      "c.max_quiz_attempts_per_day", "c.quiz_time_limit_sec", "c.navigation_mode", "c.completion_rule",
      "c.credential_enabled", "c.credential_name_th", "c.credential_name_en",
      sql<string>`coalesce(u.legal_full_name_th, u.legal_full_name_en, split_part(u.email, '@', 1))`.as("instructor_name"),
    ])
    .where("c.slug", "=", slug)
    .executeTakeFirst();
  if (!course) return null;
  const manager = canManageCourse(user, course.instructor_id);
  if (!manager && (course.visibility === "draft" || course.visibility === "suspended")) return null;

  const enrollment = user
    ? await db
        .selectFrom("enrollments")
        .select(["id", "status", "completed_at"])
        .where("user_id", "=", user.id)
        .where("course_id", "=", course.id)
        .executeTakeFirst()
    : undefined;

  const enrollmentKey = enrollment?.id ?? NO_ID;
  const lessons = await db
    .selectFrom("lessons as l")
    .leftJoin("lesson_progress as p", (j) => j.onRef("p.lesson_id", "=", "l.id").on("p.enrollment_id", "=", enrollmentKey))
    .select([
      "l.id", "l.sequence_order", "l.title", "l.youtube_video_id", "l.duration_sec", "l.video_status", "l.is_public",
      "l.checkpoint_question", "l.checkpoint_options", "l.checkpoint_at_sec", "l.unit_id", "l.description", "l.learner_note",
      "p.is_completed", "p.max_watched_sec", "p.last_position_sec", "p.watched_chunks", "p.total_chunks_required", "p.accumulated_valid_sec",
      sql<number>`(select count(*)::int from quiz_questions q where q.lesson_id = l.id and q.assessment_type = 'lesson' and q.is_active)`.as("test_question_count"),
      sql<number>`(select count(*)::int from quiz_attempts a where a.enrollment_id = ${enrollmentKey} and a.lesson_id = l.id and a.assessment_type = 'lesson' and a.is_passed)`.as("passed_test_count"),
      sql<string | null>`(select max(a.score_percentage)::text from quiz_attempts a where a.enrollment_id = ${enrollmentKey} and a.lesson_id = l.id and a.assessment_type = 'lesson' and a.submitted_at is not null)`.as("best_test_score"),
      sql<boolean>`exists (select 1 from checkpoint_attempts ca where ca.user_id = ${user?.id ?? NO_ID} and ca.lesson_id = l.id and ca.passed_at is not null)`.as("checkpoint_passed"),
    ])
    .where("l.course_id", "=", course.id)
    .orderBy("l.sequence_order")
    .execute();

  const units = await db
    .selectFrom("course_units")
    .select(["id", "sequence_order", "title", "summary"])
    .where("course_id", "=", course.id)
    .orderBy("sequence_order")
    .execute();
  const completionRule = asCompletionRule(course.completion_rule);

  const assessmentState = await db
    .selectFrom("courses as c")
    .select([
      sql<number>`(select count(*)::int from quiz_questions q where q.course_id = c.id and q.assessment_type = 'pre' and q.is_active)`.as("pre_questions"),
      sql<number>`(select count(*)::int from quiz_questions q where q.course_id = c.id and q.assessment_type = 'post' and q.is_active)`.as("post_questions"),
      sql<number>`(select count(*)::int from quiz_attempts a where a.enrollment_id = ${enrollment?.id ?? "00000000-0000-0000-0000-000000000000"} and a.assessment_type = 'pre' and a.submitted_at is not null)`.as("pre_attempts"),
    ])
    .where("c.id", "=", course.id)
    .executeTakeFirstOrThrow();

  // Sequential lock: pre-test (when configured), earlier video, and its lesson test must be complete.
  const preTestCompleted = assessmentState.pre_questions === 0 || assessmentState.pre_attempts > 0;
  let allPreviousDone = preTestCompleted;
  const unitById = new Map(units.map((u) => [u.id, u]));
  const lessonViews = lessons.map((l) => {
    const unlocked = !course.is_sequential_locked || allPreviousDone;
    const lessonTestRequired = l.test_question_count > 0;
    const lessonTestSubmitted = l.best_test_score !== null;
    const lessonTestPassed = !lessonTestRequired || l.passed_test_count > 0;
    // "Done" = good enough to move on, per the course rule (passed, or just answered for lesson_tests_average)
    const lessonTestDone = lessonTestSatisfied(completionRule, { required: lessonTestRequired, passed: lessonTestPassed, submitted: lessonTestSubmitted });
    allPreviousDone &&= l.is_completed === true && lessonTestDone;
    const watchedChunks = l.watched_chunks ?? [];
    const watchedPercent = l.total_chunks_required ? Math.min(100, Math.floor((watchedChunks.length / l.total_chunks_required) * 100)) : 0;
    const unit = l.unit_id ? unitById.get(l.unit_id) : undefined;
    return {
      id: l.id,
      order: l.sequence_order,
      title: l.title,
      videoId: l.youtube_video_id,
      durationSec: l.duration_sec,
      broken: l.video_status !== "active",
      completed: l.is_completed === true,
      maxWatchedSec: l.max_watched_sec ?? 0,
      lastPositionSec: l.last_position_sec ?? 0,
      watchedChunks,
      watchedPercent,
      unlocked,
      lessonTestRequired,
      lessonTestPassed,
      lessonTestSubmitted,
      lessonTestDone,
      lessonTestBestScore: l.best_test_score === null ? null : Number(l.best_test_score),
      lessonTestQuestionCount: l.test_question_count,
      isPublic: l.is_public !== false,
      unitId: unit?.id ?? null,
      description: l.description,
      learnerNote: l.learner_note,
      checkpoint: l.checkpoint_question
        ? { question: l.checkpoint_question, options: (l.checkpoint_options ?? []) as string[], atSec: l.checkpoint_at_sec ?? 0 }
        : null,
      checkpointPassed: l.checkpoint_question ? l.checkpoint_passed : true,
    };
  });
  const lessonTests = summarizeLessonTests(
    lessonViews.map((l) => ({ questionCount: l.lessonTestQuestionCount, bestScore: l.lessonTestBestScore })),
    course.passing_quiz_score,
  );
  const unitViews = units.map((u, i) => {
    const members = lessonViews.filter((l) => l.unitId === u.id);
    return {
      id: u.id,
      number: i + 1,
      title: u.title,
      summary: u.summary,
      lessonCount: members.length,
      durationSec: members.reduce((n, l) => n + l.durationSec, 0),
      completedCount: members.filter((l) => l.completed && l.lessonTestDone).length,
    };
  });

  const programs = await programsForCourse(course.id);
  const certificate = user
    ? await db.selectFrom("certificates").select(["certificate_code", "revoked_at"]).where("user_id", "=", user.id).where("course_id", "=", course.id).executeTakeFirst()
    : undefined;

  return {
    course,
    manager,
    enrollment: enrollment ?? null,
    lessons: lessonViews,
    units: unitViews,
    completionRule,
    navigationMode: asNavigationMode(course.navigation_mode),
    /** Combined end-of-lesson test score (drives the result for lesson_tests_average courses). */
    lessonTests,
    allLessonsCompleted: lessonViews.length > 0 && lessonViews.every((l) => l.completed),
    allLessonTestsPassed: lessonViews.every((l) => l.lessonTestDone),
    readyForPostTest: completionRule === "post_test" && lessonViews.length > 0 && lessonViews.every((l) => l.completed && l.lessonTestDone),
    preTest: { required: assessmentState.pre_questions > 0, completed: preTestCompleted },
    postTest: { configured: assessmentState.post_questions > 0 },
    certificate: certificate ?? null,
    programs: programs.map((p) => ({ slug: p.slug, title: p.title })),
    programOnly: course.visibility === "unlisted" && programs.length > 0,
  };
}

export async function enroll(user: CurrentUser, courseId: string): Promise<void> {
  const { db, env } = ctx();
  const course = await db.selectFrom("courses").select(["visibility", "instructor_id", "title", "slug"]).where("id", "=", courseId).executeTakeFirst();
  if (!course || (course.visibility !== "published" && course.visibility !== "unlisted")) throw new HttpError(404, "NOT_FOUND");
  // Anti-farming: an instructor can't earn a certificate from their own course
  if (course.instructor_id === user.id) throw new HttpError(403, "CANNOT_ENROLL_OWN_COURSE");
  // An unlisted course that belongs to a live training program is reachable only through a cohort registration
  // (approval creates the enrollment), so the link can't be used to skip the program's conditions.
  if (course.visibility === "unlisted" && (await programsForCourse(courseId)).length > 0) {
    throw new HttpError(403, "PROGRAM_REGISTRATION_REQUIRED", "รายวิชานี้เปิดให้เรียนผ่านการสมัครหลักสูตรอบรมเท่านั้น");
  }
  await assertProfileComplete(user.id);

  await db.transaction().execute(async (trx) => {
    const now = new Date();
    const enrollment = await trx
      .insertInto("enrollments")
      .values({ user_id: user.id, course_id: courseId, enrolled_at: now })
      .onConflict((oc) => oc.columns(["user_id", "course_id"]).doNothing())
      .returning("id")
      .executeTakeFirst();
    if (!enrollment) return;
    await addEmailToOutbox(
      trx,
      { template: "enrollment-confirmed", to: user.email, courseTitle: course.title, courseLink: `${env.APP_ORIGIN}/courses/${course.slug}`, enrolledAt: now.toISOString() },
      { userId: user.id, deduplicationKey: `enrollment-confirmed:${enrollment.id}` },
    );
  });
}

export async function myEnrollments(userId: string) {
  return ctx()
    .db.selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .leftJoin("certificates as cert", "cert.enrollment_id", "e.id")
    .select(["c.slug", "c.title", "e.status", "e.enrolled_at", "cert.certificate_code", "cert.revoked_at"])
    .where("e.user_id", "=", userId)
    .orderBy("e.enrolled_at", "desc")
    .execute();
}

/** Learner dashboard: every enrollment with lesson progress, plus totals. */
export async function learnerOverview(userId: string) {
  const { db } = ctx();
  const rows = await db
    .selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .leftJoin("certificates as cert", "cert.enrollment_id", "e.id")
    .select([
      "e.id as enrollment_id", "e.status", "e.enrolled_at", "e.completed_at",
      "c.id as course_id", "c.slug", "c.title", "c.is_verified_course", "c.total_duration_sec",
      "cert.certificate_code", "cert.revoked_at", "cert.issued_at",
      sql<number>`(select count(*)::int from lessons l where l.course_id = c.id)`.as("lesson_count"),
      sql<number>`(select count(*)::int from lesson_progress p where p.enrollment_id = e.id and p.is_completed)`.as("completed_lessons"),
      sql<number>`(select coalesce(sum(p.accumulated_valid_sec), 0)::int from lesson_progress p where p.enrollment_id = e.id)`.as("study_sec"),
      sql<string | null>`(select l.youtube_video_id from lessons l where l.course_id = c.id order by l.sequence_order limit 1)`.as("cover_video_id"),
      sql<string | null>`(select l.id from lessons l left join lesson_progress p on p.lesson_id = l.id and p.enrollment_id = e.id
        where l.course_id = c.id and l.video_status = 'active' and coalesce(p.is_completed, false) = false order by l.sequence_order limit 1)`.as("next_lesson_id"),
      sql<string | null>`(select l.title from lessons l left join lesson_progress p on p.lesson_id = l.id and p.enrollment_id = e.id
        where l.course_id = c.id and l.video_status = 'active' and coalesce(p.is_completed, false) = false order by l.sequence_order limit 1)`.as("next_lesson_title"),
    ])
    .where("e.user_id", "=", userId)
    .orderBy("e.enrolled_at", "desc")
    .execute();

  const enrollments = rows.map((r) => ({
    ...r,
    progressPercent: r.lesson_count ? Math.round((r.completed_lessons / r.lesson_count) * 100) : 0,
  }));
  return {
    enrollments,
    stats: {
      enrolled: enrollments.filter((e) => e.status !== "revoked").length,
      completed: enrollments.filter((e) => e.status === "completed").length,
      certificates: enrollments.filter((e) => e.certificate_code && !e.revoked_at).length,
      studySec: enrollments.reduce((n, e) => n + e.study_sec, 0),
    },
  };
}

/** Public numbers for the landing page (published content only). */
export async function publicStats() {
  return ctx()
    .db.selectNoFrom([
      sql<number>`(select count(*)::int from courses where visibility = 'published')`.as("courses"),
      sql<number>`(select count(*)::int from lessons l join courses c on c.id = l.course_id where c.visibility = 'published')`.as("lessons"),
      sql<number>`(select coalesce(sum(total_duration_sec), 0)::int from courses where visibility = 'published')`.as("durationSec"),
      sql<number>`(select count(*)::int from certificates where revoked_at is null)`.as("certificates"),
    ])
    .executeTakeFirstOrThrow();
}
