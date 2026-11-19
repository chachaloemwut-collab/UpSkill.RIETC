import "server-only";
import { HEARTBEAT, chunksInRange, meetsCompletion } from "@upskill/core";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { HttpError } from "../http";
import { tryCompleteByLessonTests } from "../courses/completion.service";
import { asNavigationMode } from "./heartbeat.service";
import { submitActivityAnswer, getLessonActivityStates } from "./activity-learner.service";

export const CHECKPOINT_POINTS = 10;
export const CHECKPOINT_PENALTY_PER_WRONG = 2;
export const CHECKPOINT_MAX_ATTEMPTS = 3;
/** After 3 wrong answers the learner rewatches this many seconds before the question (not the whole lesson). */
export const CHECKPOINT_REWATCH_SEC = 60;

export interface CheckpointAnswer {
  correct: boolean;
  /** The checkpoint was answered correctly in a previous session; no video pause needed. */
  alreadyPassed?: boolean;
  /** Current score (0–10). Only present once the answer is known. */
  score: number | null;
  attemptsLeft: number;
  /** true when 3 wrong answers were given: the part before the question must be watched again. */
  locked: boolean;
  /** When locked: the part [fromSec, toSec) that was marked unwatched. */
  rewatch?: { fromSec: number; toSec: number };
  /** The correct answer completed the lesson (it had been watched in full already). */
  lessonCompleted?: boolean;
}

/** The part a learner must rewatch after locking a checkpoint at `atSec`. */
export function checkpointRewatchRange(atSec: number, durationSec: number) {
  const fromSec = Math.max(0, Math.floor((atSec - CHECKPOINT_REWATCH_SEC) / HEARTBEAT.CHUNK_SEC) * HEARTBEAT.CHUNK_SEC);
  const toSec = Math.min(durationSec, Math.ceil((atSec + 1) / HEARTBEAT.CHUNK_SEC) * HEARTBEAT.CHUNK_SEC);
  return { fromSec, toSec };
}

/**
 * Grade one in-video checkpoint answer with a scoring penalty:
 * - correct on attempt N  → score = max(0, 10 - 2·(N-1)), video resumes; completes the lesson if it was
 *                           already watched in full (completion waits for the checkpoint)
 * - wrong                 → one attempt used, remaining attempts returned
 * - wrong on attempt 3    → checkpoint locks and only the minute before the question is marked unwatched;
 *                           starting the lesson again re-arms the checkpoint
 */
export async function submitCheckpointAnswer(userId: string, lessonId: string, optionIndex: number, enrollmentId?: string): Promise<CheckpointAnswer> {
  const { db } = ctx();

  // If a lesson_activities row exists, delegate to the new multi-activity system.
  // Look up the enrollment if not provided (backward-compat call sites omit it).
  const resolvedEnrollmentId =
    enrollmentId ??
    (
      await db
        .selectFrom("enrollments as e")
        .innerJoin("lessons as l", "l.course_id", "e.course_id")
        .select("e.id")
        .where("l.id", "=", lessonId)
        .where("e.user_id", "=", userId)
        .executeTakeFirst()
    )?.id;

  if (resolvedEnrollmentId) {
    const activity = await db
      .selectFrom("lesson_activities")
      .select(["id"])
      .where("lesson_id", "=", lessonId)
      .where("activity_type", "=", "question")
      .where("is_active", "=", true)
      .orderBy("position_sec", "asc")
      .limit(1)
      .executeTakeFirst();
    if (activity) return submitActivityAnswer(userId, resolvedEnrollmentId, activity.id, optionIndex);
  }

  const lesson = await db
    .selectFrom("lessons")
    .select(["id", "checkpoint_question", "checkpoint_correct_index", "checkpoint_at_sec", "duration_sec"])
    .where("id", "=", lessonId)
    .executeTakeFirst();
  if (!lesson || lesson.checkpoint_question === null || lesson.checkpoint_correct_index === null) throw new HttpError(404, "NO_CHECKPOINT");

  const row = await db
    .selectFrom("checkpoint_attempts")
    .selectAll()
    .where("user_id", "=", userId)
    .where("lesson_id", "=", lessonId)
    .executeTakeFirst();

  if (row?.passed_at) return { correct: true, alreadyPassed: true, score: row.score ?? CHECKPOINT_POINTS, attemptsLeft: 0, locked: false };
  if (row?.locked_at) return { correct: false, score: null, attemptsLeft: 0, locked: true };

  const correct = optionIndex === lesson.checkpoint_correct_index;
  const attempts = (row?.attempt_count ?? 0) + 1;

  if (correct) {
    const score = Math.max(0, CHECKPOINT_POINTS - CHECKPOINT_PENALTY_PER_WRONG * (attempts - 1));
    await db
      .insertInto("checkpoint_attempts")
      .values({ user_id: userId, lesson_id: lessonId, attempt_count: attempts, correct_on_attempt: attempts, score, passed_at: new Date() })
      .onConflict((oc) =>
        oc.columns(["user_id", "lesson_id"]).doUpdateSet({
          attempt_count: attempts,
          correct_on_attempt: attempts,
          score,
          passed_at: new Date(),
          locked_at: null,
          updated_at: new Date(),
        }),
      )
      .execute();
    const lessonCompleted = await completeLessonIfWatched(userId, lessonId);
    return { correct: true, score, attemptsLeft: 0, locked: false, lessonCompleted };
  }

  if (attempts >= CHECKPOINT_MAX_ATTEMPTS) {
    const rewatch = checkpointRewatchRange(lesson.checkpoint_at_sec ?? 0, lesson.duration_sec);
    const removed = chunksInRange(rewatch.fromSec, rewatch.toSec);
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("checkpoint_attempts")
        .values({ user_id: userId, lesson_id: lessonId, attempt_count: attempts, locked_at: new Date() })
        .onConflict((oc) => oc.columns(["user_id", "lesson_id"]).doUpdateSet({ attempt_count: attempts, locked_at: new Date(), updated_at: new Date() }))
        .execute();
      // Penalty: the minute before the question becomes unwatched again (all of this user's enrollments).
      // The learner resumes from its start; the furthest point is pulled back too so linear courses replay it.
      await trx
        .updateTable("lesson_progress")
        .set({
          watched_chunks: sql<number[]>`coalesce((select array_agg(c order by c) from unnest(watched_chunks) c where not (c = any(${removed}::int[]))), '{}'::int[])`,
          max_watched_sec: sql<number>`least(max_watched_sec, ${rewatch.fromSec})`,
          last_position_sec: rewatch.fromSec,
          segment_start_pos_sec: null,
          segment_started_at: null,
          last_ping_at: null,
          is_completed: false,
        })
        .where("lesson_id", "=", lessonId)
        .where("enrollment_id", "in", (eb) => eb.selectFrom("enrollments").select("id").where("user_id", "=", userId))
        .execute();
    });
    return { correct: false, score: null, attemptsLeft: 0, locked: true, rewatch };
  }

  await db
    .insertInto("checkpoint_attempts")
    .values({ user_id: userId, lesson_id: lessonId, attempt_count: attempts })
    .onConflict((oc) => oc.columns(["user_id", "lesson_id"]).doUpdateSet({ attempt_count: attempts, updated_at: new Date() }))
    .execute();
  const projectedScore = Math.max(0, CHECKPOINT_POINTS - CHECKPOINT_PENALTY_PER_WRONG * attempts);
  return { correct: false, score: projectedScore, attemptsLeft: CHECKPOINT_MAX_ATTEMPTS - attempts, locked: false };
}

/**
 * After a correct checkpoint answer: lessons whose video was already watched in full were held back from
 * completion by the unanswered question — complete them now (same rules as the heartbeat).
 */
async function completeLessonIfWatched(userId: string, lessonId: string): Promise<boolean> {
  const { db } = ctx();
  return db.transaction().execute(async (trx) => {
    const rows = await trx
      .selectFrom("lesson_progress as p")
      .innerJoin("enrollments as e", "e.id", "p.enrollment_id")
      .innerJoin("lessons as l", "l.id", "p.lesson_id")
      .innerJoin("courses as c", "c.id", "l.course_id")
      .select(["p.id", "p.enrollment_id", "p.watched_chunks", "p.accumulated_valid_sec", "l.duration_sec", "c.min_watch_percentage", "c.navigation_mode"])
      .where("p.lesson_id", "=", lessonId)
      .where("e.user_id", "=", userId)
      .where("p.is_completed", "=", false)
      .forUpdate("p")
      .execute();
    let completed = false;
    for (const r of rows) {
      const ok = meetsCompletion(
        { watchedChunks: new Set(r.watched_chunks), accumulatedValidSec: r.accumulated_valid_sec },
        { durationSec: r.duration_sec, minWatchPercentage: r.min_watch_percentage, navigationMode: asNavigationMode(r.navigation_mode) },
      );
      if (!ok) continue;
      await trx.updateTable("lesson_progress").set({ is_completed: true, completed_at: new Date() }).where("id", "=", r.id).execute();
      await tryCompleteByLessonTests(trx, r.enrollment_id);
      completed = true;
    }
    return completed;
  });
}

/** State passed to the player so a passed checkpoint is not asked again after a page reload. */
export async function getCheckpointState(userId: string, lessonId: string, enrollmentId?: string) {
  const { db } = ctx();

  // New multi-activity path: return all activity states for the lesson.
  // Resolve enrollmentId if not passed.
  const resolvedEnrollmentId =
    enrollmentId ??
    (
      await db
        .selectFrom("enrollments as e")
        .innerJoin("lessons as l", "l.course_id", "e.course_id")
        .select("e.id")
        .where("l.id", "=", lessonId)
        .where("e.user_id", "=", userId)
        .executeTakeFirst()
    )?.id;

  if (resolvedEnrollmentId) {
    const activities = await getLessonActivityStates(resolvedEnrollmentId, lessonId);
    if (activities.length > 0) {
      // Backward-compat shape: use the first question activity
      const q = activities.find((a) => a.activityType === "question");
      if (q) {
        return {
          passed: q.state.passed,
          locked: q.state.locked,
          score: q.state.score,
          attemptsUsed: q.state.attemptsUsed,
          attemptsLeft: q.state.locked ? 0 : Math.max(0, CHECKPOINT_MAX_ATTEMPTS - q.state.attemptsUsed),
          // Extended: all activities
          activities,
        };
      }
      return null;
    }
  }

  // Legacy fallback: checkpoint_attempts table
  const row = await db
    .selectFrom("checkpoint_attempts")
    .select(["score", "passed_at", "locked_at", "attempt_count"])
    .where("user_id", "=", userId)
    .where("lesson_id", "=", lessonId)
    .executeTakeFirst();
  if (!row) return null;
  return {
    passed: row.passed_at !== null,
    locked: row.locked_at !== null,
    score: row.score,
    attemptsUsed: row.attempt_count,
    attemptsLeft: row.locked_at ? 0 : Math.max(0, CHECKPOINT_MAX_ATTEMPTS - row.attempt_count),
  };
}
