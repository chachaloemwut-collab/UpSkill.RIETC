/** Public course catalog, course detail with the viewer's progress, enrollment. */
import "server-only";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { HttpError } from "../http";
import type { CurrentUser } from "../auth/session";

export async function listPublishedCourses() {
  return ctx()
    .db.selectFrom("courses as c")
    .innerJoin("users as u", "u.id", "c.instructor_id")
    .select([
      "c.id", "c.slug", "c.title", "c.description", "c.thumbnail_url", "c.is_verified_course", "c.total_duration_sec",
      sql<string>`coalesce(u.legal_full_name_th, u.legal_full_name_en, split_part(u.email, '@', 1))`.as("instructor_name"),
      sql<number>`(select count(*)::int from lessons l where l.course_id = c.id)`.as("lesson_count"),
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
      "c.max_quiz_attempts_per_day", "c.quiz_time_limit_sec",
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

  const lessons = await db
    .selectFrom("lessons as l")
    .leftJoin("lesson_progress as p", (j) => j.onRef("p.lesson_id", "=", "l.id").on("p.enrollment_id", "=", enrollment?.id ?? "00000000-0000-0000-0000-000000000000"))
    .select([
      "l.id", "l.sequence_order", "l.title", "l.youtube_video_id", "l.duration_sec", "l.video_status",
      "p.is_completed", "p.max_watched_sec", "p.watched_chunks", "p.total_chunks_required", "p.accumulated_valid_sec",
    ])
    .where("l.course_id", "=", course.id)
    .orderBy("l.sequence_order")
    .execute();

  // Sequential lock: a lesson is open when every earlier lesson is completed
  let allPreviousDone = true;
  const lessonViews = lessons.map((l) => {
    const unlocked = !course.is_sequential_locked || allPreviousDone;
    allPreviousDone &&= l.is_completed === true;
    const watchedPercent = l.total_chunks_required ? Math.floor(((l.watched_chunks?.length ?? 0) / l.total_chunks_required) * 100) : 0;
    return {
      id: l.id,
      order: l.sequence_order,
      title: l.title,
      videoId: l.youtube_video_id,
      durationSec: l.duration_sec,
      broken: l.video_status !== "active",
      completed: l.is_completed === true,
      maxWatchedSec: l.max_watched_sec ?? 0,
      watchedPercent,
      unlocked,
    };
  });

  const certificate = user
    ? await db.selectFrom("certificates").select(["certificate_code", "revoked_at"]).where("user_id", "=", user.id).where("course_id", "=", course.id).executeTakeFirst()
    : undefined;

  return {
    course,
    manager,
    enrollment: enrollment ?? null,
    lessons: lessonViews,
    allLessonsCompleted: lessonViews.length > 0 && lessonViews.every((l) => l.completed),
    certificate: certificate ?? null,
  };
}

export async function enroll(user: CurrentUser, courseId: string): Promise<void> {
  const { db } = ctx();
  const course = await db.selectFrom("courses").select(["visibility", "instructor_id"]).where("id", "=", courseId).executeTakeFirst();
  if (!course || (course.visibility !== "published" && course.visibility !== "unlisted")) throw new HttpError(404, "NOT_FOUND");
  // Anti-farming: an instructor can't earn a certificate from their own course
  if (course.instructor_id === user.id) throw new HttpError(403, "CANNOT_ENROLL_OWN_COURSE");

  await db
    .insertInto("enrollments")
    .values({ user_id: user.id, course_id: courseId })
    .onConflict((oc) => oc.columns(["user_id", "course_id"]).doNothing())
    .execute();
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
