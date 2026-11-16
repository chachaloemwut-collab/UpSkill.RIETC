/**
 * POST /api/learning/lessons/:id/start-session
 * Checks the sequential lock HERE (spec 5.2 step 2). The resulting session is bound to this lesson,
 * so heartbeat doesn't need to re-check (saves one query per ping).
 */
import "server-only";
import { sql } from "@upskill/db";
import { generateToken, hashToken, totalChunksFor } from "@upskill/core";
import { claimActiveLearningSession } from "@upskill/infra/learning-lock";
import { ctx } from "../context";
import { HttpError } from "../http";

export async function startLearningSession(input: { userId: string; lessonId: string; ip: string; userAgent: string }) {
  const { db, redis } = ctx();

  const lesson = await db
    .selectFrom("lessons as l")
    .innerJoin("courses as c", "c.id", "l.course_id")
    .innerJoin("enrollments as e", (j) => j.onRef("e.course_id", "=", "c.id").on("e.user_id", "=", input.userId))
    .leftJoin("program_cohorts as pc", "pc.id", "e.cohort_id")
    .select([
      "l.id", "l.course_id", "l.sequence_order", "l.duration_sec", "l.video_status",
      "c.visibility", "c.is_sequential_locked", "e.id as enrollment_id", "e.status as enrollment_status",
      "pc.starts_at as cohort_starts_at",
    ])
    .where("l.id", "=", input.lessonId)
    .executeTakeFirst();

  // Return 404 whether "not enrolled" or "doesn't exist" (don't reveal which lessons exist)
  if (!lesson || lesson.enrollment_status === "revoked") throw new HttpError(404, "NOT_FOUND");
  if (lesson.visibility === "suspended" || lesson.visibility === "draft") throw new HttpError(403, "COURSE_UNAVAILABLE");
  if (lesson.video_status !== "active") throw new HttpError(409, "VIDEO_BROKEN");
  // Enrollments granted by a training cohort open on the cohort's start date
  if (lesson.cohort_starts_at && lesson.cohort_starts_at > new Date()) throw new HttpError(403, "COHORT_NOT_STARTED");

  const preTest = await db
    .selectFrom("courses as c")
    .select([
      sql<number>`(select count(*)::int from quiz_questions q where q.course_id = c.id and q.assessment_type = 'pre' and q.is_active)`.as("questions"),
      sql<number>`(select count(*)::int from quiz_attempts a where a.enrollment_id = ${lesson.enrollment_id} and a.assessment_type = 'pre' and a.submitted_at is not null)`.as("attempts"),
    ])
    .where("c.id", "=", lesson.course_id)
    .executeTakeFirstOrThrow();
  if (preTest.questions > 0 && preTest.attempts === 0) throw new HttpError(403, "PRE_TEST_REQUIRED");

  if (lesson.is_sequential_locked) {
    // Require every earlier lesson to be completed (robust to gaps in sequence_order)
    const pending = await db
      .selectFrom("lessons as l")
      .leftJoin("lesson_progress as p", (j) => j.onRef("p.lesson_id", "=", "l.id").on("p.enrollment_id", "=", lesson.enrollment_id))
      .select(sql<number>`count(*)::int`.as("n"))
      .where("l.course_id", "=", lesson.course_id)
      .where("l.sequence_order", "<", lesson.sequence_order)
      .where((eb) => eb.or([eb("p.is_completed", "is", null), eb("p.is_completed", "=", false)]))
      .executeTakeFirstOrThrow();
    if (pending.n > 0) throw new HttpError(403, "PREVIOUS_LESSON_INCOMPLETE");

    const pendingTests = await db
      .selectFrom("lessons as l")
      .select(sql<number>`count(*)::int`.as("n"))
      .where("l.course_id", "=", lesson.course_id)
      .where("l.sequence_order", "<", lesson.sequence_order)
      .where((eb) => eb.exists(eb.selectFrom("quiz_questions as q").select("q.id").whereRef("q.lesson_id", "=", "l.id").where("q.assessment_type", "=", "lesson").where("q.is_active", "=", true)))
      .where((eb) => eb.not(eb.exists(eb.selectFrom("quiz_attempts as a").select("a.id").where("a.enrollment_id", "=", lesson.enrollment_id).whereRef("a.lesson_id", "=", "l.id").where("a.assessment_type", "=", "lesson").where("a.is_passed", "=", true))))
      .executeTakeFirstOrThrow();
    if (pendingTests.n > 0) throw new HttpError(403, "PREVIOUS_LESSON_TEST_REQUIRED");
  }

  const token = generateToken();
  const tokenHash = hashToken(token);

  const result = await db.transaction().execute(async (trx) => {
    // Close every old session of this user (DB record; the real lock is in Redis)
    await trx
      .updateTable("learning_sessions")
      .set({ ended_at: new Date(), end_reason: "superseded" })
      .where("user_id", "=", input.userId)
      .where("ended_at", "is", null)
      .execute();

    const session = await trx
      .insertInto("learning_sessions")
      .values({
        user_id: input.userId,
        enrollment_id: lesson.enrollment_id,
        lesson_id: lesson.id,
        token_hash: tokenHash,
        ip_address: input.ip,
        user_agent: input.userAgent,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // Re-arm a checkpoint that locked after 3 wrong answers: starting the lesson again gives a
    // fresh attempt slate (passed checkpoints stay, so they are not asked again on reload).
    await trx
      .deleteFrom("checkpoint_attempts")
      .where("user_id", "=", input.userId)
      .where("lesson_id", "=", lesson.id)
      .where("locked_at", "is not", null)
      .execute();

    // Create progress if missing; reset the segment so the first ping of the new session is a resync
    const progress = await trx
      .insertInto("lesson_progress")
      .values({
        enrollment_id: lesson.enrollment_id,
        lesson_id: lesson.id,
        total_chunks_required: totalChunksFor(lesson.duration_sec),
      })
      .onConflict((oc) =>
        oc.columns(["enrollment_id", "lesson_id"]).doUpdateSet({
          last_ping_at: null,
          segment_start_pos_sec: null,
          segment_started_at: null,
        }),
      )
      .returning(["max_watched_sec", "last_position_sec", "watched_chunks", "is_completed"])
      .executeTakeFirstOrThrow();

    return { sessionId: session.id, progress };
  });

  await claimActiveLearningSession(redis, input.userId, result.sessionId, tokenHash.toString("hex"));

  return {
    streamToken: token,
    resumeAtSec: result.progress.last_position_sec,
    maxWatchedSec: result.progress.max_watched_sec,
    watchedChunks: result.progress.watched_chunks.length,
    totalChunks: totalChunksFor(lesson.duration_sec),
    isCompleted: result.progress.is_completed,
  };
}
