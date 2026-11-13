import { describe, expect, it } from "vitest";
import { buildAttemptSnapshot, gradeAttempt, toClientQuestions, type QuestionRecord } from "./quiz.ts";

const questions: QuestionRecord[] = [1, 2, 3, 4].map((n) => ({
  id: `q${n}`,
  questionText: `Q${n}`,
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" },
  ],
  correctOptionId: "b",
}));

describe("quiz", () => {
  it("never leaks the answer key to the client", () => {
    const snap = buildAttemptSnapshot(questions);
    const json = JSON.stringify(toClientQuestions(snap));
    expect(json).not.toContain("correct");
  });

  it("remaps option ids per attempt", () => {
    const snap = buildAttemptSnapshot(questions);
    expect(snap.every((s) => s.options.every((o) => !["a", "b", "c"].includes(o.id)))).toBe(true);
  });

  it("grades against the snapshot", () => {
    const snap = buildAttemptSnapshot(questions);
    const answers = Object.fromEntries(snap.map((s, i) => [s.questionId, i < 3 ? s.correctOptionId : "wrong"]));
    expect(gradeAttempt(snap, answers)).toEqual({ correct: 3, total: 4, scorePercentage: 75 });
  });

  it("answering with original ids gives no credit", () => {
    const snap = buildAttemptSnapshot(questions);
    const answers = Object.fromEntries(snap.map((s) => [s.questionId, "b"]));
    expect(gradeAttempt(snap, answers).correct).toBe(0);
  });
});
