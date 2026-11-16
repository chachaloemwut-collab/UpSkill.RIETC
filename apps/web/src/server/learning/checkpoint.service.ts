import "server-only";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { HttpError } from "../http";

export const CHECKPOINT_POINTS = 10;
export const CHECKPOINT_PENALTY_PER_WRONG = 2;
export const CHECKPOINT_MAX_ATTEMPTS = 3;

export interface CheckpointAnswer {
  correct: boolean;
  /** The checkpoint was answered correctly in a previous session; no video pause needed. */
  alreadyPassed?: boolean;
  /** Current score (0–10). Only present once the answer is known. */
  score: number | null;
  attemptsLeft: number;
  /** true when 3 wrong answers were given: the lesson must be watched again from the start. */
  locked: boolean;
}

/**
 * Grade one in-video checkpoint answer with a scoring penalty:
 * - correct on attempt N  → score = max(0, 10 - 2·(N-1)), video resumes
 * - wrong                 → one attempt used, remaining attempts returned
 * - wrong on attempt 3    → checkpoint locks AND the lesson progress resets to zero
 *   (the learner must rewatch the lesson; the checkpoint re-arms for the new run)
 */
export async function submitCheckpointAnswer(userId: string, lessonId: string, optionIndex: number): Promise<CheckpointAnswer> {
  const { db } = ctx();
  const lesson = await db
    .selectFrom("lessons")
    .select(["id", "checkpoint_question", "checkpoint_correct_index"])
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
    return { correct: true, score, attemptsLeft: 0, locked: false };
  }

  if (attempts >= CHECKPOINT_MAX_ATTEMPTS) {
    await db
      .insertInto("checkpoint_attempts")
      .values({ user_id: userId, lesson_id: lessonId, attempt_count: attempts, locked_at: new Date() })
      .onConflict((oc) => oc.columns(["user_id", "lesson_id"]).doUpdateSet({ attempt_count: attempts, locked_at: new Date(), updated_at: new Date() }))
      .execute();
    // Penalty: the learner must rewatch this lesson from the beginning (all enrollments).
    await db
      .updateTable("lesson_progress")
      .set({
        max_watched_sec: 0,
        last_position_sec: 0,
        accumulated_valid_sec: 0,
        segment_start_pos_sec: 0,
        watched_chunks: sql<number[]>`'{}'::int[]`,
        last_ping_at: new Date(),
      })
      .where("lesson_id", "=", lessonId)
      .where("enrollment_id", "in", (eb) => eb.selectFrom("enrollments").select("id").where("user_id", "=", userId))
      .execute();
    return { correct: false, score: null, attemptsLeft: 0, locked: true };
  }

  await db
    .insertInto("checkpoint_attempts")
    .values({ user_id: userId, lesson_id: lessonId, attempt_count: attempts })
    .onConflict((oc) => oc.columns(["user_id", "lesson_id"]).doUpdateSet({ attempt_count: attempts, updated_at: new Date() }))
    .execute();
  const projectedScore = Math.max(0, CHECKPOINT_POINTS - CHECKPOINT_PENALTY_PER_WRONG * attempts);
  return { correct: false, score: projectedScore, attemptsLeft: CHECKPOINT_MAX_ATTEMPTS - attempts, locked: false };
}

/** State passed to the player so a passed checkpoint is not asked again after a page reload. */
export async function getCheckpointState(userId: string, lessonId: string) {
  const row = await ctx()
    .db.selectFrom("checkpoint_attempts")
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
