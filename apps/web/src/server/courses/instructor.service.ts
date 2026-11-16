/**
 * Instructor course management (spec 5.3). Every function starts with loadOwnedCourse():
 * IDOR check `course.instructor_id === current_user.id` (admins may manage any course).
 */
import "server-only";
import { extractYouTubeVideoId, type VideoValidation } from "@upskill/core";
import { sql, type Tx } from "@upskill/db";
import { fetchVideos } from "@upskill/infra/youtube-client";
import { ctx } from "../context";
import { addEmailToOutbox } from "../email/outbox.service";
import { HttpError } from "../http";
import { audit } from "../audit";
import { slugify } from "../slug";
import type { CurrentUser } from "../auth/session";

export const PUBLISH_RULES = { minTotalDurationSec: 600, minQuestions: 3 } as const;

const YT_ERRORS: Record<Exclude<VideoValidation, { ok: true }>["reason"], string> = {
  NOT_FOUND: "ไม่พบวิดีโอนี้บน YouTube",
  NOT_EMBEDDABLE: "เจ้าของคลิปปิดการฝังวิดีโอ (embed) ไว้",
  NOT_PUBLIC: "วิดีโอต้องเป็น Public หรือ Unlisted เท่านั้น",
  LIVE_OR_UPCOMING: "ไม่รองรับไลฟ์สด",
  AGE_RESTRICTED: "วิดีโอจำกัดอายุไม่สามารถฝังได้",
  NOT_PROCESSED: "วิดีโอยังประมวลผลไม่เสร็จ",
  BAD_DURATION: "อ่านความยาววิดีโอไม่ได้",
};

async function loadOwnedCourse(user: CurrentUser, courseId: string) {
  const c = await ctx()
    .db.selectFrom("courses")
    .select(["id", "instructor_id", "visibility", "title"])
    .where("id", "=", courseId)
    .executeTakeFirst();
  // 404 (not 403) so non-owners can't probe which course ids exist
  if (!c || (c.instructor_id !== user.id && user.role !== "admin")) throw new HttpError(404, "NOT_FOUND");
  return c;
}

/** Instructors see their own courses; admins see every course (with its instructor) so they can manage all of them */
export async function listMyCourses(user: CurrentUser) {
  return ctx()
    .db.selectFrom("courses as c")
    .innerJoin("users as u", "u.id", "c.instructor_id")
    .select([
      "c.id", "c.slug", "c.title", "c.visibility", "c.total_duration_sec", "c.is_verified_course", "c.updated_at", "c.instructor_id",
      sql<string>`coalesce(u.legal_full_name_th, u.legal_full_name_en, split_part(u.email, '@', 1))`.as("instructor_name"),
      sql<number>`(select count(*)::int from lessons l where l.course_id = c.id)`.as("lesson_count"),
      sql<number>`(select count(*)::int from enrollments e where e.course_id = c.id)`.as("enrollment_count"),
      sql<number>`(select count(*)::int from lessons l where l.course_id = c.id and l.video_status <> 'active')`.as("broken_count"),
      sql<number>`(select count(*)::int from enrollments e where e.course_id = c.id and e.status = 'completed')`.as("completed_count"),
      sql<string | null>`(select l.youtube_video_id from lessons l where l.course_id = c.id order by l.sequence_order limit 1)`.as("cover_video_id"),
      sql<number>`(select count(*)::int from program_courses pc where pc.course_id = c.id)`.as("program_count"),
    ])
    .$if(user.role !== "admin", (q) => q.where("c.instructor_id", "=", user.id))
    .orderBy("c.updated_at", "desc")
    .execute();
}

/** Users who may own a course (active instructors and admins), for the admin's instructor picker */
export async function listInstructors() {
  return ctx()
    .db.selectFrom("users")
    .select(["id", "email", sql<string>`coalesce(legal_full_name_th, legal_full_name_en, split_part(email, '@', 1))`.as("name"), "role"])
    .where("role", "in", ["instructor", "admin"])
    .where("status", "=", "active")
    .where("is_system_owner", "=", false)
    .orderBy("email")
    .limit(500)
    .execute();
}

async function assertCourseOwnerCandidate(instructorId: string) {
  const owner = await ctx()
    .db.selectFrom("users")
    .select(["id", "role", "status"])
    .where("id", "=", instructorId)
    .executeTakeFirst();
  if (!owner || owner.status !== "active" || (owner.role !== "instructor" && owner.role !== "admin")) {
    throw new HttpError(422, "INSTRUCTOR_INVALID", "ผู้สอนต้องเป็นบัญชีผู้สอนหรือผู้ดูแลที่ใช้งานอยู่");
  }
}

/** Admin moves a course to another instructor. Audited: it changes who signs certificates and who may not enroll. */
export async function reassignInstructor(admin: CurrentUser, courseId: string, instructorId: string, meta: { ip: string }) {
  if (admin.role !== "admin") throw new HttpError(403, "FORBIDDEN");
  const { db } = ctx();
  const course = await db.selectFrom("courses").select(["id", "instructor_id"]).where("id", "=", courseId).executeTakeFirst();
  if (!course) throw new HttpError(404, "NOT_FOUND");
  if (course.instructor_id === instructorId) return;
  await assertCourseOwnerCandidate(instructorId);
  // Anti-farming: the new instructor must not be a learner of this course
  const enrolled = await db.selectFrom("enrollments").select("id").where("course_id", "=", courseId).where("user_id", "=", instructorId).executeTakeFirst();
  if (enrolled) throw new HttpError(409, "INSTRUCTOR_ENROLLED", "ผู้สอนคนนี้ลงทะเบียนเรียนรายวิชานี้อยู่ จึงเป็นผู้สอนไม่ได้");
  await db.updateTable("courses").set({ instructor_id: instructorId }).where("id", "=", courseId).execute();
  await audit(db, { action: "course.instructor_changed", userId: admin.id, entityType: "course", entityId: courseId, ip: meta.ip, details: { from: course.instructor_id, to: instructorId } });
}

export async function getCourseForEditing(user: CurrentUser, courseId: string) {
  await loadOwnedCourse(user, courseId);
  const { db } = ctx();
  const course = await db.selectFrom("courses").selectAll().where("id", "=", courseId).executeTakeFirstOrThrow();
  const lessons = await db
    .selectFrom("lessons")
    .select(["id", "sequence_order", "title", "youtube_video_id", "duration_sec", "video_status", "checkpoint_question", "checkpoint_options", "checkpoint_correct_index", "checkpoint_at_sec"])
    .where("course_id", "=", courseId)
    .orderBy("sequence_order")
    .execute();
  // Includes the answer key: this view is for the course owner only
  const questions = await db
    .selectFrom("quiz_questions")
    .select(["id", "question_text", "options", "correct_option_id", "assessment_type", "lesson_id"])
    .where("course_id", "=", courseId)
    .where("is_active", "=", true)
    .orderBy("created_at")
    .execute();
  return { course, lessons, questions };
}

export async function createCourse(
  user: CurrentUser,
  input: { title: string; description?: string | undefined; instructorId?: string | undefined },
  meta?: { ip: string },
) {
  if (user.role !== "instructor" && user.role !== "admin") throw new HttpError(403, "FORBIDDEN");
  // Only admins may create a course on behalf of another instructor
  if (input.instructorId && input.instructorId !== user.id) {
    if (user.role !== "admin") throw new HttpError(403, "FORBIDDEN");
    await assertCourseOwnerCandidate(input.instructorId);
  }
  const instructorId = input.instructorId ?? user.id;
  const { db } = ctx();
  const c = await db
    .insertInto("courses")
    .values({ instructor_id: instructorId, title: input.title.trim(), description: input.description?.trim() || null, slug: slugify(input.title, "course") })
    .returning(["id", "slug"])
    .executeTakeFirstOrThrow();
  if (instructorId !== user.id) {
    await audit(db, { action: "course.created_for_instructor", userId: user.id, entityType: "course", entityId: c.id, ip: meta?.ip, details: { instructorId } });
  }
  return c;
}

export async function updateCourse(
  user: CurrentUser,
  courseId: string,
  patch: Partial<{
    title: string;
    description: string | null;
    min_watch_percentage: number;
    passing_quiz_score: number;
    is_sequential_locked: boolean;
    max_quiz_attempts_per_day: number;
    quiz_time_limit_sec: number;
    credential_enabled: boolean;
    credential_type: string;
    credential_name_th: string;
    credential_name_en: string | null;
    credential_template_key: string;
    credential_validity_days: number | null;
    credential_signer_name: string | null;
    credential_signer_title: string | null;
    credential_achievement_th: string;
    credential_achievement_en: string | null;
    credential_background_url: string | null;
    credential_text_align: string;
  }>,
) {
  await loadOwnedCourse(user, courseId);
  if (Object.keys(patch).length === 0) return;
  await ctx().db.updateTable("courses").set(patch).where("id", "=", courseId).execute();
}

async function lookupVideo(videoId: string, devDurationSec?: number): Promise<{ durationSec: number; title: string }> {
  const { env } = ctx();
  if (!env.YOUTUBE_API_KEY) {
    // Development without a YouTube key: accept a manual duration. Never allowed in production (env requires the key).
    if (env.APP_ENV !== "production" && devDurationSec) return { durationSec: devDurationSec, title: "" };
    throw new HttpError(503, "YOUTUBE_NOT_CONFIGURED", "ยังไม่ได้ตั้งค่า YOUTUBE_API_KEY (dev: ระบุ dev_duration_sec)");
  }
  const result = (await fetchVideos(env.YOUTUBE_API_KEY, [videoId])).get(videoId);
  if (!result?.ok) throw new HttpError(422, result?.reason ?? "NOT_FOUND", YT_ERRORS[result?.reason ?? "NOT_FOUND"]);
  return { durationSec: result.durationSec, title: result.title };
}

async function recomputeDuration(trx: Tx, courseId: string) {
  await trx
    .updateTable("courses")
    .set({ total_duration_sec: sql<number>`(select coalesce(sum(duration_sec), 0)::int from lessons where course_id = ${courseId})` })
    .where("id", "=", courseId)
    .execute();
}

export async function addLesson(user: CurrentUser, courseId: string, input: { url: string; title?: string | undefined; devDurationSec?: number | undefined }) {
  await loadOwnedCourse(user, courseId);
  const videoId = extractYouTubeVideoId(input.url);
  if (!videoId) throw new HttpError(400, "INVALID_YOUTUBE_URL", "ลิงก์ YouTube ไม่ถูกต้อง");
  const video = await lookupVideo(videoId, input.devDurationSec);
  const title = (input.title?.trim() || video.title || "บทเรียน").slice(0, 255);

  return ctx()
    .db.transaction()
    .execute(async (trx) => {
      await trx.selectFrom("courses").select("id").where("id", "=", courseId).forUpdate().execute();
      const next = await trx
        .selectFrom("lessons")
        .select(sql<number>`coalesce(max(sequence_order), 0)::int + 1`.as("n"))
        .where("course_id", "=", courseId)
        .executeTakeFirstOrThrow();
      const lesson = await trx
        .insertInto("lessons")
        .values({ course_id: courseId, sequence_order: next.n, title, youtube_video_id: videoId, duration_sec: video.durationSec })
        .returning(["id", "sequence_order", "duration_sec"])
        .executeTakeFirstOrThrow();
      await recomputeDuration(trx, courseId);
      return lesson;
    });
}

/** Fix a broken lesson by pointing it at a new video (spec 3.2 #2) */
export async function replaceLessonVideo(user: CurrentUser, courseId: string, lessonId: string, input: { url: string; devDurationSec?: number | undefined }) {
  await loadOwnedCourse(user, courseId);
  const videoId = extractYouTubeVideoId(input.url);
  if (!videoId) throw new HttpError(400, "INVALID_YOUTUBE_URL", "ลิงก์ YouTube ไม่ถูกต้อง");
  const video = await lookupVideo(videoId, input.devDurationSec);

  await ctx()
    .db.transaction()
    .execute(async (trx) => {
      const res = await trx
        .updateTable("lessons")
        .set({ youtube_video_id: videoId, duration_sec: video.durationSec, video_status: "active", video_checked_at: new Date() })
        .where("id", "=", lessonId)
        .where("course_id", "=", courseId)
        .executeTakeFirst();
      if (Number(res.numUpdatedRows) === 0) throw new HttpError(404, "NOT_FOUND");
      await trx
        .updateTable("lesson_progress")
        .set({ total_chunks_required: Math.ceil(video.durationSec / 10) })
        .where("lesson_id", "=", lessonId)
        .execute();
      await trx.updateTable("video_reports").set({ resolved_at: new Date() }).where("lesson_id", "=", lessonId).where("resolved_at", "is", null).execute();
      await recomputeDuration(trx, courseId);
    });
}

export async function renameLesson(user: CurrentUser, courseId: string, lessonId: string, title: string) {
  await loadOwnedCourse(user, courseId);
  await ctx().db.updateTable("lessons").set({ title: title.trim() }).where("id", "=", lessonId).where("course_id", "=", courseId).execute();
}

export async function setLessonCheckpoint(
  user: CurrentUser,
  courseId: string,
  lessonId: string,
  input: { question: string; options: string[]; correctIndex: number; atSec: number } | null,
) {
  await loadOwnedCourse(user, courseId);
  await ctx()
    .db.updateTable("lessons")
    .set(
      input === null
        ? { checkpoint_question: null, checkpoint_options: null, checkpoint_correct_index: null, checkpoint_at_sec: null }
        : { checkpoint_question: input.question, checkpoint_options: JSON.stringify(input.options), checkpoint_correct_index: input.correctIndex, checkpoint_at_sec: input.atSec },
    )
    .where("id", "=", lessonId)
    .where("course_id", "=", courseId)
    .execute();
}

export async function deleteLesson(user: CurrentUser, courseId: string, lessonId: string) {
  const c = await loadOwnedCourse(user, courseId);
  const { db } = ctx();
  // Deleting a lesson after publishing would silently erase learners' progress
  if (c.visibility !== "draft") {
    const n = await db.selectFrom("enrollments").select(sql<number>`count(*)::int`.as("n")).where("course_id", "=", courseId).executeTakeFirstOrThrow();
    if (n.n > 0) throw new HttpError(409, "COURSE_HAS_LEARNERS", "หลักสูตรมีผู้เรียนแล้ว ไม่สามารถลบบทเรียนได้ (เปลี่ยนวิดีโอแทนได้)");
  }
  await db.transaction().execute(async (trx) => {
    const del = await trx.deleteFrom("lessons").where("id", "=", lessonId).where("course_id", "=", courseId).returning("sequence_order").executeTakeFirst();
    if (!del) throw new HttpError(404, "NOT_FOUND");
    await sql`SET CONSTRAINTS uq_lessons_order DEFERRED`.execute(trx);
    await trx.updateTable("lessons").set({ sequence_order: sql<number>`sequence_order - 1` }).where("course_id", "=", courseId).where("sequence_order", ">", del.sequence_order).execute();
    await recomputeDuration(trx, courseId);
  });
}

export async function reorderLessons(user: CurrentUser, courseId: string, orderedIds: string[]) {
  await loadOwnedCourse(user, courseId);
  await ctx()
    .db.transaction()
    .execute(async (trx) => {
      const existing = await trx.selectFrom("lessons").select("id").where("course_id", "=", courseId).forUpdate().execute();
      const ids = new Set(existing.map((l) => l.id));
      if (orderedIds.length !== ids.size || !orderedIds.every((id) => ids.has(id)) || new Set(orderedIds).size !== orderedIds.length) {
        throw new HttpError(400, "ORDER_MISMATCH");
      }
      // Unique (course_id, sequence_order) is DEFERRABLE: swap freely, checked at commit
      await sql`SET CONSTRAINTS uq_lessons_order DEFERRED`.execute(trx);
      for (const [i, id] of orderedIds.entries()) {
        await trx.updateTable("lessons").set({ sequence_order: i + 1 }).where("id", "=", id).execute();
      }
    });
}

export async function addQuestion(
  user: CurrentUser,
  courseId: string,
  input: { text: string; options: string[]; correctIndex: number; assessmentType: "pre" | "lesson" | "post"; lessonId?: string | undefined },
) {
  await loadOwnedCourse(user, courseId);
  if (input.correctIndex < 0 || input.correctIndex >= input.options.length) throw new HttpError(400, "BAD_CORRECT_INDEX");
  if ((input.assessmentType === "lesson") !== Boolean(input.lessonId)) throw new HttpError(400, "ASSESSMENT_TARGET_INVALID");
  if (input.lessonId) {
    const lesson = await ctx().db.selectFrom("lessons").select("id").where("id", "=", input.lessonId).where("course_id", "=", courseId).executeTakeFirst();
    if (!lesson) throw new HttpError(404, "NOT_FOUND");
  }
  const options = input.options.map((text, i) => ({ id: String.fromCharCode(97 + i), text: text.trim() }));
  return ctx()
    .db.insertInto("quiz_questions")
    .values({
      course_id: courseId,
      assessment_type: input.assessmentType,
      lesson_id: input.lessonId ?? null,
      question_text: input.text.trim(),
      options: JSON.stringify(options),
      correct_option_id: options[input.correctIndex]!.id,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
}

/** Soft delete: past attempts keep their snapshot */
export async function removeQuestion(user: CurrentUser, courseId: string, questionId: string) {
  await loadOwnedCourse(user, courseId);
  await ctx().db.updateTable("quiz_questions").set({ is_active: false }).where("id", "=", questionId).where("course_id", "=", courseId).execute();
}

/** Update an existing quiz question without deleting historical attempt snapshots */
export async function updateQuestion(
  user: CurrentUser,
  courseId: string,
  questionId: string,
  input: {
    text: string;
    options: string[];
    correctIndex: number;
    assessmentType: "pre" | "lesson" | "post";
    lessonId?: string | null | undefined;
  },
) {
  await loadOwnedCourse(user, courseId);
  if (input.correctIndex < 0 || input.correctIndex >= input.options.length) throw new HttpError(400, "BAD_CORRECT_INDEX", "ลำดับคำตอบที่ถูกต้องไม่ถูกต้อง");
  if ((input.assessmentType === "lesson") !== Boolean(input.lessonId)) throw new HttpError(400, "ASSESSMENT_TARGET_INVALID", "แบบทดสอบระหว่างบทต้องระบุบทเรียน");
  if (input.lessonId) {
    const lesson = await ctx().db.selectFrom("lessons").select("id").where("id", "=", input.lessonId).where("course_id", "=", courseId).executeTakeFirst();
    if (!lesson) throw new HttpError(404, "NOT_FOUND", "ไม่พบบทเรียนที่ระบุ");
  }
  const options = input.options.map((text, i) => ({ id: String.fromCharCode(97 + i), text: text.trim() }));
  await ctx()
    .db.updateTable("quiz_questions")
    .set({
      question_text: input.text.trim(),
      options: JSON.stringify(options),
      correct_option_id: options[input.correctIndex]!.id,
      assessment_type: input.assessmentType,
      lesson_id: input.lessonId ?? null,
    })
    .where("id", "=", questionId)
    .where("course_id", "=", courseId)
    .execute();
}

/**
 * List all learners enrolled in a course with their progress, quiz attempts and completion status.
 */
export async function listCourseLearners(
  user: CurrentUser,
  courseId: string,
  params: { query?: string | undefined; status?: string | undefined; page?: number | undefined; pageSize?: number | undefined } = {},
) {
  await loadOwnedCourse(user, courseId);
  const { db } = ctx();
  const q = (params.query ?? "").trim();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize || 50));

  let query = db
    .selectFrom("enrollments as e")
    .innerJoin("users as u", "u.id", "e.user_id")
    .leftJoin("certificates as cert", "cert.enrollment_id", "e.id")
    .select([
      "e.id as enrollment_id",
      "e.status",
      "e.enrolled_at",
      "e.completed_at",
      "u.id as user_id",
      "u.email as user_email",
      "u.legal_full_name_th",
      "u.legal_full_name_en",
      "cert.certificate_code",
      sql<number>`(select coalesce(sum(p.accumulated_valid_sec), 0)::int from lesson_progress p where p.enrollment_id = e.id)`.as("study_sec"),
      sql<number>`(select count(*)::int from lesson_progress p join lessons l on l.id = p.lesson_id where p.enrollment_id = e.id and l.course_id = ${courseId} and p.is_completed)`.as("lessons_completed"),
      sql<number>`(select count(*)::int from lessons l where l.course_id = ${courseId})`.as("lessons_total"),
      sql<string | null>`(select max(a.score_percentage)::text from quiz_attempts a where a.enrollment_id = e.id and a.assessment_type = 'post' and a.is_passed)`.as("best_quiz_score"),
      sql<number>`(select count(*)::int from quiz_attempts a where a.enrollment_id = e.id and a.assessment_type = 'post' and a.started_at > now() - interval '24 hours')`.as("attempts_24h"),
      sql<number>`(select count(*)::int from quiz_attempts a where a.enrollment_id = e.id and a.assessment_type = 'post')`.as("total_attempts"),
    ])
    .where("e.course_id", "=", courseId);

  if (q) {
    query = query.where((eb) =>
      eb.or([
        eb("u.email", "ilike", `%${q}%`),
        eb("u.legal_full_name_th", "ilike", `%${q}%`),
        eb("u.legal_full_name_en", "ilike", `%${q}%`),
      ]),
    );
  }

  if (params.status) {
    query = query.where("e.status", "=", params.status);
  }

  const learners = await query
    .orderBy("e.enrolled_at", "desc")
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .execute();

  const total = await db
    .selectFrom("enrollments as e")
    .innerJoin("users as u", "u.id", "e.user_id")
    .select(sql<number>`count(*)::int`.as("count"))
    .where("e.course_id", "=", courseId)
    .$if(Boolean(q), (eb) =>
      eb.where((b) =>
        b.or([
          b("u.email", "ilike", `%${q}%`),
          b("u.legal_full_name_th", "ilike", `%${q}%`),
          b("u.legal_full_name_en", "ilike", `%${q}%`),
        ]),
      ),
    )
    .$if(Boolean(params.status), (eb) => eb.where("e.status", "=", params.status!))
    .executeTakeFirstOrThrow();

  return {
    learners: learners.map((l) => ({
      ...l,
      enrolled_at: new Date(l.enrolled_at).toISOString(),
      completed_at: l.completed_at ? new Date(l.completed_at).toISOString() : null,
    })),
    total: total.count,
    page,
    pageSize,
  };
}

/**
 * Reset quiz attempts lockout for a student in this course (e.g. after network drop / crash).
 */
export async function resetCourseLearnerQuizAttempts(
  user: CurrentUser,
  courseId: string,
  enrollmentId: string,
  meta: { ip: string },
) {
  await loadOwnedCourse(user, courseId);
  const { db } = ctx();
  const enrollment = await db
    .selectFrom("enrollments")
    .select(["id", "user_id"])
    .where("id", "=", enrollmentId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
  if (!enrollment) throw new HttpError(404, "NOT_FOUND", "ไม่พบการลงทะเบียนนี้ในหลักสูตร");

  await db.transaction().execute(async (trx) => {
    // If an attempt is stuck open (submitted_at IS NULL), close it so uq_quiz_attempt_open is cleared
    await trx
      .updateTable("quiz_attempts")
      .set({ submitted_at: new Date() })
      .where("enrollment_id", "=", enrollmentId)
      .where("submitted_at", "is", null)
      .execute();

    // Shift started_at of attempts in the last 24h by 25h backward to reset the daily counter
    await trx
      .updateTable("quiz_attempts")
      .set({ started_at: sql<Date>`started_at - interval '25 hours'` })
      .where("enrollment_id", "=", enrollmentId)
      .where("started_at", ">", sql<Date>`now() - interval '24 hours'`)
      .execute();
  });

  await audit(db, {
    action: "course.quiz_attempts_reset",
    userId: user.id,
    entityType: "course",
    entityId: courseId,
    ip: meta.ip,
    details: { enrollmentId, targetUserId: enrollment.user_id },
  });

  return { ok: true };
}

/**
 * Detailed lesson progress and quiz attempt history for a specific student in this course.
 */
export async function getCourseLearnerProgressDetail(
  user: CurrentUser,
  courseId: string,
  enrollmentId: string,
) {
  await loadOwnedCourse(user, courseId);
  const { db } = ctx();

  const enrollment = await db
    .selectFrom("enrollments as e")
    .innerJoin("users as u", "u.id", "e.user_id")
    .select([
      "e.id",
      "e.status",
      "e.enrolled_at",
      "e.completed_at",
      "u.email",
      "u.legal_full_name_th",
      "u.legal_full_name_en",
    ])
    .where("e.id", "=", enrollmentId)
    .where("e.course_id", "=", courseId)
    .executeTakeFirst();
  if (!enrollment) throw new HttpError(404, "NOT_FOUND");

  const lessons = await db
    .selectFrom("lessons as l")
    .leftJoin("lesson_progress as p", (j) =>
      j.onRef("p.lesson_id", "=", "l.id").on("p.enrollment_id", "=", enrollmentId),
    )
    .select([
      "l.id",
      "l.sequence_order",
      "l.title",
      "l.duration_sec",
      "l.checkpoint_question",
      "l.checkpoint_at_sec",
      "p.is_completed",
      "p.accumulated_valid_sec",
      "p.max_watched_sec",
      "p.watched_chunks",
      "p.total_chunks_required",
    ])
    .where("l.course_id", "=", courseId)
    .orderBy("l.sequence_order", "asc")
    .execute();

  const attempts = await db
    .selectFrom("quiz_attempts")
    .select([
      "id",
      "assessment_type",
      "started_at",
      "submitted_at",
      "score_percentage",
      "is_passed",
    ])
    .where("enrollment_id", "=", enrollmentId)
    .orderBy("started_at", "desc")
    .limit(20)
    .execute();

  return {
    enrollment: {
      ...enrollment,
      enrolled_at: new Date(enrollment.enrolled_at).toISOString(),
      completed_at: enrollment.completed_at ? new Date(enrollment.completed_at).toISOString() : null,
    },
    lessons,
    attempts: attempts.map((a) => ({
      ...a,
      started_at: new Date(a.started_at).toISOString(),
      submitted_at: a.submitted_at ? new Date(a.submitted_at).toISOString() : null,
    })),
  };
}

/** Spec 5.3 #2 anti-farming rules are checked here, before a course can be published */
export async function setVisibility(user: CurrentUser, courseId: string, visibility: "draft" | "published" | "unlisted" | "archived", meta: { ip: string }) {
  const c = await loadOwnedCourse(user, courseId);
  if (c.visibility === "suspended" && user.role !== "admin") throw new HttpError(403, "COURSE_SUSPENDED", "หลักสูตรถูกระงับโดยผู้ดูแลระบบ");
  const { db, env } = ctx();

  if (visibility === "published" || visibility === "unlisted") {
    const stats = await db
      .selectFrom("courses as c")
      .select([
        "c.total_duration_sec",
        sql<number>`(select count(*)::int from lessons l where l.course_id = c.id)`.as("lessons"),
        sql<number>`(select count(*)::int from lessons l where l.course_id = c.id and l.video_status <> 'active')`.as("broken"),
        sql<number>`(select count(*)::int from quiz_questions q where q.course_id = c.id and q.assessment_type = 'post' and q.is_active)`.as("questions"),
      ])
      .where("c.id", "=", courseId)
      .executeTakeFirstOrThrow();
    const problems: string[] = [];
    if (stats.lessons === 0) problems.push("ต้องมีบทเรียนอย่างน้อย 1 บท");
    if (stats.total_duration_sec < PUBLISH_RULES.minTotalDurationSec) problems.push("ความยาวรวมต้องอย่างน้อย 10 นาที");
    if (stats.questions < PUBLISH_RULES.minQuestions) problems.push("ต้องมีข้อสอบอย่างน้อย 3 ข้อ");
    if (stats.broken > 0) problems.push("มีวิดีโอที่ใช้งานไม่ได้");
    if (problems.length) throw new HttpError(422, "PUBLISH_REQUIREMENTS_NOT_MET", problems.join(" · "));
  }

  const changedAt = new Date();
  const statusLabels = { draft: "ฉบับร่าง", published: "เผยแพร่", unlisted: "ไม่แสดงในคลังหลักสูตร", archived: "ปิดหลักสูตร / เข้าคลัง" } as const;
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("courses")
      .set({ visibility, ...(visibility === "published" ? { published_at: sql<Date>`coalesce(published_at, now())` } : {}) })
      .where("id", "=", courseId)
      .execute();
    await addEmailToOutbox(
      trx,
      { template: "course-status-changed", to: user.email, courseTitle: c.title, statusLabel: statusLabels[visibility], manageLink: `${env.APP_ORIGIN}/instructor/courses/${courseId}` },
      { userId: user.id, deduplicationKey: `course-status:${courseId}:${visibility}:${changedAt.toISOString()}` },
    );
  });
  if (visibility === "published") await audit(db, { action: "course.published", userId: user.id, entityType: "course", entityId: courseId, ip: meta.ip });
  if (visibility === "archived") await audit(db, { action: "course.archived", userId: user.id, entityType: "course", entityId: courseId, ip: meta.ip });
}

