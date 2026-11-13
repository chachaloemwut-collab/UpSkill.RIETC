import { describe, expect, it } from "vitest";
import { evaluateHeartbeat, type ProgressState, type LessonRules, chunksInRange } from "./heartbeat.ts";

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
