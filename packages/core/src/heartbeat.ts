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
  /**
   * free_complete mode: the final chunk may stay unwatched when it is this short or shorter
   * (players often stop a fraction of a second before the true end).
   */
  FREE_TAIL_TOLERANCE_SEC: 5,
} as const;

/**
 * linear        = watch from the start; seeking past the furthest point watched earns nothing (original rule)
 * free_complete = seek anywhere, but every part of the video must be watched in real time to complete
 */
export type NavigationMode = "linear" | "free_complete";

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
  minWatchPercentage: number; // 50..100 (linear mode only; free_complete always requires every part)
  navigationMode?: NavigationMode; // default "linear"
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
      resyncReason?: "FIRST_PING" | "GAP" | "SEEK_BACK" | "SEEK_WITHIN_WATCHED" | "SEEK_FORWARD" | "UNANCHORED" | "FLAGGED";
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
  if (rules.navigationMode === "free_complete") {
    const missing = missingChunks(state.watchedChunks, rules.durationSec);
    const total = totalChunksFor(rules.durationSec);
    const tailSec = rules.durationSec - (total - 1) * HEARTBEAT.CHUNK_SEC;
    const coverageOk = missing.length === 0 || (missing.length === 1 && missing[0] === total - 1 && tailSec <= HEARTBEAT.FREE_TAIL_TOLERANCE_SEC);
    const timeOk = state.accumulatedValidSec >= rules.durationSec * HEARTBEAT.ACCUMULATED_TIME_FACTOR;
    return coverageOk && timeOk;
  }
  const pctOk = watchedPercentOf(state.watchedChunks, rules.durationSec) >= rules.minWatchPercentage;
  const timeOk =
    state.accumulatedValidSec >=
    rules.durationSec * (rules.minWatchPercentage / 100) * HEARTBEAT.ACCUMULATED_TIME_FACTOR;
  return pctOk && timeOk;
}

/** Chunk indexes not yet watched, in order. */
export function missingChunks(chunks: ReadonlySet<number> | readonly number[], durationSec: number): number[] {
  const have = chunks instanceof Set ? chunks : new Set(chunks as readonly number[]);
  const out: number[] = [];
  for (let i = 0; i < totalChunksFor(durationSec); i++) if (!have.has(i)) out.push(i);
  return out;
}

/** Unwatched parts of a video as merged second ranges [fromSec, toSec) — for the learner's coverage map. */
export function unwatchedRanges(chunks: ReadonlySet<number> | readonly number[], durationSec: number): Array<{ fromSec: number; toSec: number }> {
  const ranges: Array<{ fromSec: number; toSec: number }> = [];
  for (const c of missingChunks(chunks, durationSec)) {
    const fromSec = c * HEARTBEAT.CHUNK_SEC;
    const toSec = Math.min(durationSec, fromSec + HEARTBEAT.CHUNK_SEC);
    const last = ranges.at(-1);
    if (last && last.toSec === fromSec) last.toSec = toSec;
    else ranges.push({ fromSec, toSec });
  }
  return ranges;
}

/** Watched parts as merged second ranges [fromSec, toSec). */
export function watchedRanges(chunks: ReadonlySet<number> | readonly number[], durationSec: number): Array<{ fromSec: number; toSec: number }> {
  const sorted = [...(chunks instanceof Set ? chunks : new Set(chunks as readonly number[]))].filter((c) => c >= 0 && c < totalChunksFor(durationSec)).sort((a, b) => a - b);
  const ranges: Array<{ fromSec: number; toSec: number }> = [];
  for (const c of sorted) {
    const fromSec = c * HEARTBEAT.CHUNK_SEC;
    const toSec = Math.min(durationSec, fromSec + HEARTBEAT.CHUNK_SEC);
    const last = ranges.at(-1);
    if (last && last.toSec === fromSec) last.toSec = toSec;
    else ranges.push({ fromSec, toSec });
  }
  return ranges;
}

/**
 * Where "jump to the next unwatched part" should go from the current position: the start of the first gap
 * after `fromSec`, wrapping to the earliest gap. null when everything has been watched.
 */
export function nextUnwatchedSec(chunks: ReadonlySet<number> | readonly number[], durationSec: number, fromSec: number): number | null {
  const gaps = unwatchedRanges(chunks, durationSec);
  if (gaps.length === 0) return null;
  return (gaps.find((g) => g.fromSec > fromSec) ?? gaps[0]!).fromSec;
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

  const free = rules.navigationMode === "free_complete";
  if (tooFast) {
    // Jumping forward within already-watched content is allowed (normal seek). Beyond the frontier = flag.
    if (position <= prev.maxWatchedSec + T) return resync("SEEK_WITHIN_WATCHED");
    if (free) {
      // Free navigation: a single big jump is a seek (allowed, the skipped part simply stays unwatched).
      // Small steady overruns that only the cumulative check catches are playback-speed tampering.
      if (delta > elapsedSec + T) return resync("SEEK_FORWARD");
      return resync("FLAGGED", "POSITION_JUMP");
    }
    return resync("FLAGGED", "POSITION_JUMP");
  }

  // Segment not anchored to the frontier (e.g. started from a point never watched) -> no credit.
  // In free navigation every real-time segment counts wherever it starts.
  const anchored = free || prev.lastPositionSec <= prev.maxWatchedSec + T;
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
