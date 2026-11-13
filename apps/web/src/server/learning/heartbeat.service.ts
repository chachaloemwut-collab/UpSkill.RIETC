/**
 * POST /api/learning/lessons/:id/heartbeat
 *
 * Order of checks (spec 5.2, adjusted):
 *  1. stream token -> learning_session (hash lookup) + Redis active lock  -> 409 SESSION_SUPERSEDED
 *  2. (sequential lock was already checked at start-session)
 *  3-5. evaluateHeartbeat() in @upskill/core, inside a transaction that does SELECT ... FOR UPDATE
 *       -> concurrent pings are processed one at a time (no double-credit race)
 *       -> uses the DB clock now() as the single time source (multiple app instances don't need matching clocks)
 */
import "server-only";
import { sql } from "@upskill/db";
import { evaluateHeartbeat, hashToken } from "@upskill/core";
import { assertActiveLearningSession } from "@upskill/infra/learning-lock";
import { ctx } from "../context";
import { HttpError } from "../http";
import { audit } from "../audit";

export async function processHeartbeat(input: {
  userId: string;
  lessonId: string;
  streamToken: string;
  seq: number;
  positionSec: number;
  ip: string;
}) {
  const { db, redis } = ctx();
  const tokenHash = hashToken(input.streamToken);

  const session = await db
    .selectFrom("learning_sessions")
    .select(["id", "user_id", "lesson_id", "enrollment_id", "ended_at"])
    .where("token_hash", "=", tokenHash)
    .executeTakeFirst();
  if (!session || session.user_id !== input.userId || session.lesson_id !== input.lessonId) {
    throw new HttpError(401, "INVALID_STREAM_TOKEN");
  }
  const active = await assertActiveLearningSession(redis, input.userId, session.id, tokenHash.toString("hex"));
  if (session.ended_at || !active) throw new HttpError(409, "SESSION_SUPERSEDED");

  return db.transaction().execute(async (trx) => {
    const s = await trx
      .selectFrom("learning_sessions")
      .select(["last_seq"])
      .where("id", "=", session.id)
      .forUpdate()
      .executeTakeFirstOrThrow();

    const row = await trx
      .selectFrom("lesson_progress as p")
      .innerJoin("lessons as l", "l.id", "p.lesson_id")
      .innerJoin("courses as c", "c.id", "l.course_id")
      .select([
        "p.id", "p.watched_chunks", "p.max_watched_sec", "p.last_position_sec", "p.accumulated_valid_sec",
        "p.last_ping_at", "p.segment_start_pos_sec", "p.segment_started_at", "p.is_completed",
        "l.duration_sec", "c.min_watch_percentage",
        sql<Date>`now()`.as("db_now"),
      ])
      .where("p.enrollment_id", "=", session.enrollment_id)
      .where("p.lesson_id", "=", input.lessonId)
      .forUpdate("p")
      .executeTakeFirstOrThrow();

    const ms = (d: Date | string | null) => (d === null ? null : new Date(d).getTime());
    const outcome = evaluateHeartbeat(
      {
        watchedChunks: new Set(row.watched_chunks),
        maxWatchedSec: row.max_watched_sec,
        lastPositionSec: row.last_position_sec,
        accumulatedValidSec: row.accumulated_valid_sec,
        lastPingAtMs: ms(row.last_ping_at),
        segmentStartPosSec: row.segment_start_pos_sec,
        segmentStartedAtMs: ms(row.segment_started_at),
        isCompleted: row.is_completed,
      },
      s.last_seq,
      { seq: input.seq, positionSec: input.positionSec },
      { durationSec: row.duration_sec, minWatchPercentage: row.min_watch_percentage },
      new Date(row.db_now).getTime(),
    );

    if (outcome.kind === "ignored") {
      if (outcome.reason === "TOO_FREQUENT") throw new HttpError(429, "TOO_FREQUENT");
      return { status: "ignored" as const };
    }

    const st = outcome.state;
    await trx
      .updateTable("lesson_progress")
      .set({
        watched_chunks: [...st.watchedChunks].sort((a, b) => a - b),
        max_watched_sec: st.maxWatchedSec,
        last_position_sec: st.lastPositionSec,
        accumulated_valid_sec: st.accumulatedValidSec,
        last_ping_at: new Date(st.lastPingAtMs!),
        segment_start_pos_sec: st.segmentStartPosSec,
        segment_started_at: st.segmentStartedAtMs === null ? null : new Date(st.segmentStartedAtMs),
        is_completed: st.isCompleted,
        ...(outcome.completedNow ? { completed_at: new Date(st.lastPingAtMs!) } : {}),
        ...(outcome.flag ? { cheat_flag_count: sql<number>`cheat_flag_count + 1` } : {}),
      })
      .where("id", "=", row.id)
      .execute();

    await trx.updateTable("learning_sessions").set({ last_seq: input.seq }).where("id", "=", session.id).execute();

    if (outcome.flag) {
      await trx
        .insertInto("anticheat_events")
        .values({
          learning_session_id: session.id,
          user_id: input.userId,
          lesson_id: input.lessonId,
          reason: outcome.flag,
          details: JSON.stringify({ seq: input.seq, positionSec: input.positionSec, prevPositionSec: row.last_position_sec }),
        })
        .execute();
      await audit(trx, { action: "learning.cheat_flag", userId: input.userId, entityType: "lesson", entityId: input.lessonId, ip: input.ip, details: { reason: outcome.flag } });
    }

    return {
      status: outcome.mode, // "credited" | "resync"
      ...(outcome.flag ? { warning: outcome.flag } : {}),
      maxWatchedSec: st.maxWatchedSec,
      watchedPercent: Math.floor(outcome.watchedPercent),
      minWatchPercentage: row.min_watch_percentage,
      isCompleted: st.isCompleted,
    };
  });
}
