/**
 * Heartbeat anti-cheat engine (pure function; no DB access).
 *
 * Core principle: the server never trusts any number the client sends except "the current position".
 * Every credited second is bounded by the server's wall-clock (server receive time).
 *
 * Changes from spec 5.2 (see docs/SECURITY.md#heartbeat):
 *  1. Credit by "range" [lastPosition, position] instead of one chunk per ping
 *     -> when the network recovers, the client just sends the latest position; no backlog queue needed,
 *        and retries don't get flagged by the 8-second rule
 *  2. Check cumulative speed across the segment (catches 1.1x-1.5x, which a single ping can't detect)
 *  3. Credit only when the segment starts at or before the frontier (max_watched_sec)
 *     -> skipping unwatched content via DevTools (player.seekTo) earns no time
 *  4. seq strictly increasing per learning session -> blocks replay / duplicate retries
 */

export const HEARTBEAT = {
  INTERVAL_SEC: 10,
  /** Pings closer than this are ignored without changing state (not treated as cheating). */
  MIN_INTERVAL_SEC: 2,
  /** If the previous ping is older than this, start a new segment (pause / network drop). */
  GRACE_SEC: 35,
  CHUNK_SEC: 10,
  /** Allowance for network jitter / buffering / position rounding. */
  POSITION_TOLERANCE_SEC: 4,
  /** Fraction of time for the "real time" condition (spec: 0.9). */
  ACCUMULATED_TIME_FACTOR: 0.9,
} as const;

export interface ProgressState {
  watchedChunks: ReadonlySet<number>;
  maxWatchedSec: number;
  lastPositionSec: number;
  accumulatedValidSec: number;
  lastPingAtMs: number | null;
  segmentStartPosSec: number | null;
  segmentStartedAtMs: number | null;
  isCompleted: boolean;
}

export interface LessonRules {
  durationSec: number;
  minWatchPercentage: number; // 50..100
}

export interface Ping {
  seq: number;
  positionSec: number;
}

export type FlagReason = "POSITION_JUMP" | "POSITION_OUT_OF_RANGE";

export type HeartbeatOutcome =
  | { kind: "ignored"; reason: "DUPLICATE_OR_STALE_SEQ" | "TOO_FREQUENT" }
  | {
      kind: "accepted";
      state: ProgressState;
      creditedSec: number;
      newChunks: number[];
      /** "credited" = time counted | "resync" = new segment starts here, no credit */
      mode: "credited" | "resync";
      resyncReason?: "FIRST_PING" | "GAP" | "SEEK_BACK" | "SEEK_WITHIN_WATCHED" | "UNANCHORED" | "FLAGGED";
      flag?: FlagReason;
      completedNow: boolean;
      watchedPercent: number;
    };

export function totalChunksFor(durationSec: number): number {
  return Math.ceil(durationSec / HEARTBEAT.CHUNK_SEC);
}

export function watchedPercentOf(chunks: ReadonlySet<number>, durationSec: number): number {
  return (chunks.size / totalChunksFor(durationSec)) * 100;
}

export function meetsCompletion(state: Pick<ProgressState, "watchedChunks" | "accumulatedValidSec">, rules: LessonRules): boolean {
  const pctOk = watchedPercentOf(state.watchedChunks, rules.durationSec) >= rules.minWatchPercentage;
  const timeOk =
    state.accumulatedValidSec >=
    rules.durationSec * (rules.minWatchPercentage / 100) * HEARTBEAT.ACCUMULATED_TIME_FACTOR;
  return pctOk && timeOk;
}

/** Chunk indexes covered by the playback range [fromSec, toSec). */
export function chunksInRange(fromSec: number, toSec: number): number[] {
  if (toSec <= fromSec) return [];
  const first = Math.floor(fromSec / HEARTBEAT.CHUNK_SEC);
  const last = Math.floor((toSec - 1e-9) / HEARTBEAT.CHUNK_SEC);
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(i);
  return out;
}

export function evaluateHeartbeat(
  prev: ProgressState,
  lastSeq: number,
  ping: Ping,
  rules: LessonRules,
  nowMs: number,
): HeartbeatOutcome {
  const T = HEARTBEAT.POSITION_TOLERANCE_SEC;

  if (!Number.isInteger(ping.seq) || ping.seq <= lastSeq) {
    return { kind: "ignored", reason: "DUPLICATE_OR_STALE_SEQ" };
  }

  const elapsedSec = prev.lastPingAtMs === null ? null : (nowMs - prev.lastPingAtMs) / 1000;
  if (elapsedSec !== null && elapsedSec < HEARTBEAT.MIN_INTERVAL_SEC) {
    return { kind: "ignored", reason: "TOO_FREQUENT" };
  }

  const pos = ping.positionSec;
  const outOfRange = !Number.isFinite(pos) || pos < 0 || pos > rules.durationSec + T;
  const position = Math.min(Math.max(Math.floor(Number.isFinite(pos) ? pos : 0), 0), rules.durationSec);

  const resync = (
    reason: NonNullable<Extract<HeartbeatOutcome, { kind: "accepted" }>["resyncReason"]>,
    flag?: FlagReason,
  ): HeartbeatOutcome => {
    const state: ProgressState = {
      ...prev,
      lastPositionSec: position,
      lastPingAtMs: nowMs,
      segmentStartPosSec: position,
      segmentStartedAtMs: nowMs,
    };
    return {
      kind: "accepted",
      state,
      creditedSec: 0,
      newChunks: [],
      mode: "resync",
      resyncReason: reason,
      ...(flag ? { flag } : {}),
      completedNow: false,
      watchedPercent: watchedPercentOf(state.watchedChunks, rules.durationSec),
    };
  };

  if (outOfRange) return resync("FLAGGED", "POSITION_OUT_OF_RANGE");
  if (elapsedSec === null) return resync("FIRST_PING");
  if (elapsedSec > HEARTBEAT.GRACE_SEC) return resync("GAP");

  const delta = position - prev.lastPositionSec;
  if (delta < -T) return resync("SEEK_BACK");

  // Cumulative speed check from the start of the segment (catches 1.25x+ within ~2-3 pings)
  const segPos = prev.segmentStartPosSec ?? prev.lastPositionSec;
  const segAtMs = prev.segmentStartedAtMs ?? prev.lastPingAtMs!;
  const segContent = position - segPos;
  const segWall = (nowMs - segAtMs) / 1000;
  const tooFast = delta > elapsedSec + T || segContent > segWall + T;

  if (tooFast) {
    // Jumping forward within already-watched content is allowed (normal seek). Beyond the frontier = flag.
    if (position <= prev.maxWatchedSec + T) return resync("SEEK_WITHIN_WATCHED");
    return resync("FLAGGED", "POSITION_JUMP");
  }

  // Segment not anchored to the frontier (e.g. started from a point never watched) -> no credit
  const anchored = prev.lastPositionSec <= prev.maxWatchedSec + T;
  if (!anchored) return resync("UNANCHORED");

  const from = Math.max(0, Math.min(prev.lastPositionSec, position));
  const newChunks = chunksInRange(from, Math.max(position, from)).filter((c) => !prev.watchedChunks.has(c));
  const watchedChunks = new Set(prev.watchedChunks);
  for (const c of newChunks) watchedChunks.add(c);

  const creditedSec = Math.max(0, Math.round(Math.min(Math.max(delta, 0), elapsedSec)));
  const next: ProgressState = {
    ...prev,
    watchedChunks,
    maxWatchedSec: Math.max(prev.maxWatchedSec, position),
    lastPositionSec: position,
    accumulatedValidSec: prev.accumulatedValidSec + creditedSec,
    lastPingAtMs: nowMs,
  };
  const completedNow = !prev.isCompleted && meetsCompletion(next, rules);
  if (completedNow) next.isCompleted = true;

  return {
    kind: "accepted",
    state: next,
    creditedSec,
    newChunks,
    mode: "credited",
    completedNow,
    watchedPercent: watchedPercentOf(watchedChunks, rules.durationSec),
  };
}
