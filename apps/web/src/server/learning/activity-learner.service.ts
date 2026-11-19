import "server-only";
import { HEARTBEAT, chunksInRange, meetsCompletion } from "@upskill/core";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { HttpError } from "../http";
import { tryCompleteByLessonTests } from "../courses/completion.service";
import { asNavigationMode } from "./heartbeat.service";

/** Default policy values when a lesson_activity has no explicit policy. */
const DEFAULTS = {
  POINTS: 10,
  PENALTY_PER_WRONG: 2,
  MAX_ATTEMPTS: 3,
  REWATCH_SEC: 60,
};

export interface ActivityAnswerResult {
  correct: boolean;
  alreadyPassed?: boolean;
  score: number | null;
  attemptsLeft: number;
  locked: boolean;
  rewatch?: { fromSec: number; toSec: number };
  lessonCompleted?: boolean;
}

/** Load an activity with its policy from the DB, verifying it belongs to the enrollment's course. */
async function loadActivityForAnswer(enrollmentId: string, activityId: string) {
  const { db } = ctx();
  return db
    .selectFrom("lesson_activities as la")
    .innerJoin("lessons as l", "l.id", "la.lesson_id")
    .innerJoin("enrollments as e", "e.course_id", "l.course_id")
    .select([
      "la.id",
      "la.activity_type",
      "la.content",
      "la.policy",
      "la.position_sec",
      "la.lesson_id",
      "l.duration_sec",
    ])
    .where("la.id", "=", activityId)
    .where("e.id", "=", enrollmentId)
    .where("la.is_active", "=", true)
    .executeTakeFirst();
}

function rewatchRange(atSec: number, durationSec: number, rewatchSec: number) {
  const fromSec = Math.max(0, Math.floor((atSec - rewatchSec) / HEARTBEAT.CHUNK_SEC) * HEARTBEAT.CHUNK_SEC);
  const toSec = Math.min(durationSec, Math.ceil((atSec + 1) / HEARTBEAT.CHUNK_SEC) * HEARTBEAT.CHUNK_SEC);
  return { fromSec, toSec };
}

/**
 * Submit an answer for a lesson activity.
 * Currently only "question" activities produce a scored result; others are pass-through.
 */
export async function submitActivityAnswer(
  userId: string,
  enrollmentId: string,
  activityId: string,
  optionIndex: number,
): Promise<ActivityAnswerResult> {
  const { db } = ctx();

  const activity = await loadActivityForAnswer(enrollmentId, activityId);
  if (!activity) throw new HttpError(404, "ACTIVITY_NOT_FOUND");
  if (activity.activity_type !== "question") {
    // non-question activities: just mark as passed
    await db
      .insertInto("lesson_activity_results")
      .values({
        activity_id: activityId,
        enrollment_id: enrollmentId,
        user_id: userId,
        attempt_count: 1,
        passed_at: new Date(),
        score: 0,
        answer_data: JSON.stringify({ option_index: optionIndex }),
      })
      .onConflict((oc) =>
        oc.columns(["activity_id", "enrollment_id"]).doUpdateSet({ attempt_count: 1, passed_at: new Date(), updated_at: new Date() }),
      )
      .execute();
    return { correct: true, score: null, attemptsLeft: 0, locked: false };
  }

  const content = activity.content as Record<string, unknown>;
  const policy = activity.policy as {
    mode?: string;
    scoring?: { points?: number; penalty_per_wrong?: number; max_attempts?: number };
    on_lock?: { rewatch_sec?: number };
  };
  const correctIndex = typeof content.correct_index === "number" ? content.correct_index : -1;
  const points = policy?.scoring?.points ?? DEFAULTS.POINTS;
  const penaltyPerWrong = policy?.scoring?.penalty_per_wrong ?? DEFAULTS.PENALTY_PER_WRONG;
  const maxAttempts = policy?.scoring?.max_attempts ?? DEFAULTS.MAX_ATTEMPTS;
  const rewatchSec = policy?.on_lock?.rewatch_sec ?? DEFAULTS.REWATCH_SEC;

  const row = await db
    .selectFrom("lesson_activity_results")
    .selectAll()
    .where("activity_id", "=", activityId)
    .where("enrollment_id", "=", enrollmentId)
    .executeTakeFirst();

  if (row?.passed_at) return { correct: true, alreadyPassed: true, score: row.score ?? points, attemptsLeft: 0, locked: false };
  if (row?.locked_at) return { correct: false, score: null, attemptsLeft: 0, locked: true };

  const correct = optionIndex === correctIndex;
  const attempts = (row?.attempt_count ?? 0) + 1;

  if (correct) {
    const score = Math.max(0, points - penaltyPerWrong * (attempts - 1));
    await db
      .insertInto("lesson_activity_results")
      .values({
        activity_id: activityId,
        enrollment_id: enrollmentId,
        user_id: userId,
        attempt_count: attempts,
        correct_on_attempt: attempts,
        score,
        passed_at: new Date(),
        answer_data: JSON.stringify({ option_index: optionIndex }),
      })
      .onConflict((oc) =>
        oc.columns(["activity_id", "enrollment_id"]).doUpdateSet({
          attempt_count: attempts,
          correct_on_attempt: attempts,
          score,
          passed_at: new Date(),
          locked_at: null,
          updated_at: new Date(),
        }),
      )
      .execute();
    const lessonCompleted = await completeLessonIfWatched(userId, activity.lesson_id, enrollmentId);
    return { correct: true, score, attemptsLeft: 0, locked: false, lessonCompleted };
  }

  if (attempts >= maxAttempts) {
    const rewatch = rewatchRange(activity.position_sec, activity.duration_sec, rewatchSec);
    const removed = chunksInRange(rewatch.fromSec, rewatch.toSec);
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("lesson_activity_results")
        .values({
          activity_id: activityId,
          enrollment_id: enrollmentId,
          user_id: userId,
          attempt_count: attempts,
          locked_at: new Date(),
          answer_data: JSON.stringify({ option_index: optionIndex }),
        })
        .onConflict((oc) =>
          oc.columns(["activity_id", "enrollment_id"]).doUpdateSet({ attempt_count: attempts, locked_at: new Date(), updated_at: new Date() }),
        )
        .execute();
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
        .where("lesson_id", "=", activity.lesson_id)
        .where("enrollment_id", "=", enrollmentId)
        .execute();
    });
    return { correct: false, score: null, attemptsLeft: 0, locked: true, rewatch };
  }

  await db
    .insertInto("lesson_activity_results")
    .values({
      activity_id: activityId,
      enrollment_id: enrollmentId,
      user_id: userId,
      attempt_count: attempts,
      answer_data: JSON.stringify({ option_index: optionIndex }),
    })
    .onConflict((oc) => oc.columns(["activity_id", "enrollment_id"]).doUpdateSet({ attempt_count: attempts, updated_at: new Date() }))
    .execute();
  const projectedScore = Math.max(0, points - penaltyPerWrong * attempts);
  return { correct: false, score: projectedScore, attemptsLeft: maxAttempts - attempts, locked: false };
}

/** Load all activity states for an enrollment in a lesson (for the player on load). */
export async function getLessonActivityStates(enrollmentId: string, lessonId: string) {
  const { db } = ctx();
  const activities = await db
    .selectFrom("lesson_activities as la")
    .leftJoin("lesson_activity_results as r", (join) => join.onRef("r.activity_id", "=", "la.id").on("r.enrollment_id", "=", enrollmentId))
    .select([
      "la.id",
      "la.activity_type",
      "la.position_sec",
      "la.sequence_order",
      "la.content",
      "la.policy",
      "r.attempt_count",
      "r.score",
      "r.passed_at",
      "r.locked_at",
    ])
    .where("la.lesson_id", "=", lessonId)
    .where("la.is_active", "=", true)
    .orderBy("la.position_sec", "asc")
    .orderBy("la.sequence_order", "asc")
    .execute();

  return activities.map((a) => ({
    id: a.id,
    activityType: a.activity_type,
    positionSec: a.position_sec,
    sequenceOrder: a.sequence_order,
    content: a.content,
    policy: a.policy,
    state: {
      passed: a.passed_at !== null,
      locked: a.locked_at !== null,
      score: a.score ?? null,
      attemptsUsed: a.attempt_count ?? 0,
    },
  }));
}

/** Returns true when all required activities for a lesson are passed. */
export async function allRequiredActivitiesPassed(enrollmentId: string, lessonId: string): Promise<boolean> {
  const { db } = ctx();
  const required = await db
    .selectFrom("lesson_activities as la")
    .select("la.id")
    .where("la.lesson_id", "=", lessonId)
    .where("la.is_active", "=", true)
    .where(sql<boolean>`(la.policy->>'mode')::text IN ('required','scored')`)
    .execute();
  if (required.length === 0) return true;
  const activityIds = required.map((r) => r.id);
  const passed = await db
    .selectFrom("lesson_activity_results")
    .select(sql<number>`count(*)::int`.as("n"))
    .where("activity_id", "in", activityIds)
    .where("enrollment_id", "=", enrollmentId)
    .where("passed_at", "is not", null)
    .executeTakeFirstOrThrow();
  return passed.n >= activityIds.length;
}

async function completeLessonIfWatched(userId: string, lessonId: string, enrollmentId: string): Promise<boolean> {
  const { db } = ctx();
  return db.transaction().execute(async (trx) => {
    const rows = await trx
      .selectFrom("lesson_progress as p")
      .innerJoin("enrollments as e", "e.id", "p.enrollment_id")
      .innerJoin("lessons as l", "l.id", "p.lesson_id")
      .innerJoin("courses as c", "c.id", "l.course_id")
      .select(["p.id", "p.enrollment_id", "p.watched_chunks", "p.accumulated_valid_sec", "l.duration_sec", "c.min_watch_percentage", "c.navigation_mode"])
      .where("p.lesson_id", "=", lessonId)
      .where("p.enrollment_id", "=", enrollmentId)
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
