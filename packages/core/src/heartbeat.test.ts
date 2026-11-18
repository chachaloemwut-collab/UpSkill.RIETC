import { describe, expect, it } from "vitest";
import { evaluateHeartbeat, type ProgressState, type LessonRules, chunksInRange, meetsCompletion, missingChunks, nextUnwatchedSec, unwatchedRanges, watchedRanges } from "./heartbeat.ts";

const rules: LessonRules = { durationSec: 100, minWatchPercentage: 90 };
const fresh: ProgressState = {
  watchedChunks: new Set(),
  maxWatchedSec: 0,
  lastPositionSec: 0,
  accumulatedValidSec: 0,
  lastPingAtMs: null,
  segmentStartPosSec: null,
  segmentStartedAtMs: null,
  isCompleted: false,
};

/** Simulate a sequence of pings: [wall-clock seconds, position] */
function run(pings: Array<[number, number]>, start: ProgressState = fresh) {
  let state = start;
  let seq = 0;
  const outcomes = [];
  for (const [t, pos] of pings) {
    const o = evaluateHeartbeat(state, seq, { seq: seq + 1, positionSec: pos }, rules, t * 1000);
    outcomes.push(o);
    if (o.kind === "accepted") {
      state = o.state;
      seq += 1;
    }
  }
  return { state, outcomes };
}

describe("chunksInRange", () => {
  it("covers half-open ranges", () => {
    expect(chunksInRange(0, 10)).toEqual([0]);
    expect(chunksInRange(10, 20)).toEqual([1]);
    expect(chunksInRange(5, 25)).toEqual([0, 1, 2]);
    expect(chunksInRange(10, 10)).toEqual([]);
  });
});

describe("evaluateHeartbeat", () => {
  it("normal 1x playback completes the lesson", () => {
    const pings: Array<[number, number]> = [];
    for (let s = 0; s <= 100; s += 10) pings.push([s, s]);
    const { state, outcomes } = run(pings);
    expect(state.watchedChunks.size).toBe(10);
    expect(state.accumulatedValidSec).toBe(100);
    expect(state.isCompleted).toBe(true);
    expect(outcomes.some((o) => o.kind === "accepted" && o.completedNow)).toBe(true);
  });

  it("2x speed is flagged and earns nothing beyond the frontier", () => {
    const { state, outcomes } = run([[0, 0], [10, 20], [20, 40]]);
    expect(outcomes[1]).toMatchObject({ kind: "accepted", flag: "POSITION_JUMP", creditedSec: 0 });
    expect(state.watchedChunks.size).toBe(0);
  });

  it("1.25x speed is caught cumulatively within a few pings", () => {
    const { outcomes } = run([[0, 0], [10, 12.5], [20, 25], [30, 37.5]]);
    expect(outcomes.some((o) => o.kind === "accepted" && o.flag === "POSITION_JUMP")).toBe(true);
  });

  it("network drop within the grace window still credits the whole range with one ping", () => {
    // ping at 10s lost, next arrives at 30s with position 30
    const { state } = run([[0, 0], [30, 30]]);
    expect([...state.watchedChunks].sort()).toEqual([0, 1, 2]);
    expect(state.accumulatedValidSec).toBe(30);
  });

  it("gap beyond the grace window starts a new segment without crediting the gap", () => {
    const { state, outcomes } = run([[0, 0], [10, 10], [100, 20]]);
    expect(outcomes[2]).toMatchObject({ mode: "resync", resyncReason: "GAP" });
    expect(state.accumulatedValidSec).toBe(10);
  });

  it("seeking forward past the frontier via devtools earns no credit", () => {
    // Watched 0..20, then jumps to 70 and plays honestly from there
    const { state } = run([[0, 0], [10, 10], [20, 20], [22, 70], [32, 80], [42, 90]]);
    expect(state.maxWatchedSec).toBe(20);
    expect(state.watchedChunks.has(7)).toBe(false);
  });

  it("seeking back and rewatching is allowed", () => {
    const { state, outcomes } = run([[0, 0], [10, 10], [20, 20], [30, 5], [40, 15]]);
    expect(outcomes[3]).toMatchObject({ resyncReason: "SEEK_BACK" });
    expect(state.accumulatedValidSec).toBe(30);
  });

  it("ignores duplicate seq (client retry after lost response)", () => {
    const first = evaluateHeartbeat(fresh, 0, { seq: 1, positionSec: 0 }, rules, 0);
    expect(first.kind).toBe("accepted");
    const dup = evaluateHeartbeat(first.kind === "accepted" ? first.state : fresh, 1, { seq: 1, positionSec: 0 }, rules, 10_000);
    expect(dup).toEqual({ kind: "ignored", reason: "DUPLICATE_OR_STALE_SEQ" });
  });

  it("ignores API spam without changing state", () => {
    const { outcomes } = run([[0, 0], [0.5, 1], [1, 2]]);
    expect(outcomes[1]).toEqual({ kind: "ignored", reason: "TOO_FREQUENT" });
  });

  it("flags positions beyond the video duration", () => {
    const { outcomes } = run([[0, 0], [10, 5000]]);
    expect(outcomes[1]).toMatchObject({ flag: "POSITION_OUT_OF_RANGE" });
  });
});

describe("free_complete navigation", () => {
  const free: LessonRules = { durationSec: 100, minWatchPercentage: 50, navigationMode: "free_complete" };
  function runFree(pings: Array<[number, number]>, start: ProgressState = fresh) {
    let state = start;
    let seq = 0;
    const outcomes = [];
    for (const [t, pos] of pings) {
      const o = evaluateHeartbeat(state, seq, { seq: seq + 1, positionSec: pos }, free, t * 1000);
      outcomes.push(o);
      if (o.kind === "accepted") {
        state = o.state;
        seq += 1;
      }
    }
    return { state, outcomes };
  }

  it("a forward seek is a plain resync (no flag) and the part watched after it is credited", () => {
    // watch 0..20, jump to 60 and watch 60..80
    const { state, outcomes } = runFree([[0, 0], [10, 10], [20, 20], [22, 60], [32, 70], [42, 80]]);
    expect(outcomes[3]).toMatchObject({ mode: "resync", resyncReason: "SEEK_FORWARD" });
    expect(outcomes.some((o) => o.kind === "accepted" && o.flag)).toBe(false);
    expect([...state.watchedChunks].sort((a, b) => a - b)).toEqual([0, 1, 6, 7]);
    expect(state.isCompleted).toBe(false);
  });

  it("watching every part in any order completes; skipping one part does not", () => {
    // second half first, then the first half
    const order: Array<[number, number]> = [[0, 50], [10, 60], [20, 70], [30, 80], [40, 90], [50, 100], [52, 0], [62, 10], [72, 20], [82, 30], [92, 40]];
    const partial = runFree(order);
    expect(partial.state.isCompleted).toBe(false); // 40..50 still missing
    const full = runFree([...order, [102, 50]]);
    expect(full.state.isCompleted).toBe(true);
  });

  it("ignores minWatchPercentage: 90% coverage is not enough", () => {
    const pings: Array<[number, number]> = [];
    for (let s = 0; s <= 90; s += 10) pings.push([s, s]);
    expect(runFree(pings).state.isCompleted).toBe(false);
  });

  it("still flags steady speed-up (cumulative overrun without a single big jump)", () => {
    const { outcomes } = runFree([[0, 0], [10, 12.5], [20, 25], [30, 37.5]]);
    expect(outcomes.some((o) => o.kind === "accepted" && o.flag === "POSITION_JUMP")).toBe(true);
  });
});

describe("coverage helpers", () => {
  it("lists unwatched ranges merged and clipped to the duration", () => {
    expect(unwatchedRanges([0, 1, 4], 55)).toEqual([{ fromSec: 20, toSec: 40 }, { fromSec: 50, toSec: 55 }]);
    expect(watchedRanges(new Set([0, 1, 4]), 55)).toEqual([{ fromSec: 0, toSec: 20 }, { fromSec: 40, toSec: 50 }]);
  });

  it("finds the next unwatched part ahead, wrapping to the first gap", () => {
    expect(nextUnwatchedSec([0, 1, 4], 55, 0)).toBe(20);
    expect(nextUnwatchedSec([0, 1, 4], 55, 45)).toBe(50);
    expect(nextUnwatchedSec([0, 1, 4], 55, 52)).toBe(20);
    expect(nextUnwatchedSec([0, 1, 2, 3, 4, 5], 55, 10)).toBeNull();
  });

  it("free mode tolerates a missing final chunk only when it is very short", () => {
    const rules: LessonRules = { durationSec: 103, minWatchPercentage: 90, navigationMode: "free_complete" };
    const allButLast = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(missingChunks(allButLast, 103)).toEqual([10]);
    expect(meetsCompletion({ watchedChunks: allButLast, accumulatedValidSec: 100 }, rules)).toBe(true);
    expect(meetsCompletion({ watchedChunks: allButLast, accumulatedValidSec: 100 }, { ...rules, durationSec: 108 })).toBe(false);
  });
});
