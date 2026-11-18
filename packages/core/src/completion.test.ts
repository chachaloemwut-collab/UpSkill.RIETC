import { describe, expect, it } from "vitest";
import { lessonTestSatisfied, summarizeLessonTests } from "./completion.ts";

describe("summarizeLessonTests", () => {
  const tenSingleQuestionTests = (correct: number, answered = 10) =>
    Array.from({ length: 10 }, (_, i) => ({ questionCount: 1, bestScore: i < answered ? (i < correct ? 100 : 0) : null }));

  it("passes at exactly the passing score (8/10 = 80%)", () => {
    const s = summarizeLessonTests(tenSingleQuestionTests(8), 80);
    expect(s).toMatchObject({ tests: 10, answered: 10, correct: 8, totalQuestions: 10, scorePercent: 80, passed: true });
  });

  it("fails below the passing score (7/10)", () => {
    expect(summarizeLessonTests(tenSingleQuestionTests(7), 80).passed).toBe(false);
  });

  it("never passes while a test is still unanswered, even if the answered ones are perfect", () => {
    const s = summarizeLessonTests(tenSingleQuestionTests(9, 9), 80);
    expect(s).toMatchObject({ answered: 9, scorePercent: 100, passed: false });
  });

  it("weights by question count and ignores lessons without a test", () => {
    const s = summarizeLessonTests(
      [
        { questionCount: 4, bestScore: 50 }, // 2/4
        { questionCount: 1, bestScore: 100 }, // 1/1
        { questionCount: 0, bestScore: null }, // no test
      ],
      60,
    );
    expect(s).toMatchObject({ tests: 2, correct: 3, totalQuestions: 5, scorePercent: 60, passed: true });
  });

  it("a course with no lesson tests cannot pass by this rule", () => {
    expect(summarizeLessonTests([{ questionCount: 0, bestScore: null }], 0).passed).toBe(false);
  });
});

describe("lessonTestSatisfied", () => {
  it("post_test courses need the lesson test passed; average courses only need it answered", () => {
    const failedOnce = { required: true, passed: false, submitted: true };
    expect(lessonTestSatisfied("post_test", failedOnce)).toBe(false);
    expect(lessonTestSatisfied("lesson_tests_average", failedOnce)).toBe(true);
    expect(lessonTestSatisfied("lesson_tests_average", { required: true, passed: false, submitted: false })).toBe(false);
    expect(lessonTestSatisfied("post_test", { required: false, passed: false, submitted: false })).toBe(true);
  });
});
