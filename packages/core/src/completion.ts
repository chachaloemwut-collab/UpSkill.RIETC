/**
 * Course completion rules (pure; client-safe — no node:* imports).
 *
 * post_test            = pass the end-of-course post-test (original rule)
 * lesson_tests_average = no post-test: every end-of-lesson test must be answered at least once, and the
 *                        combined score (each lesson's best attempt, weighted by its number of questions)
 *                        must reach the course's passing score. Learners may retake a lesson test to
 *                        raise its best score (subject to the daily attempt limit).
 */
export type CompletionRule = "post_test" | "lesson_tests_average";

export interface LessonTestResult {
  /** Active questions in this lesson's test (0 = the lesson has no test). */
  questionCount: number;
  /** Best submitted score 0..100, or null when never submitted. */
  bestScore: number | null;
}

export interface LessonTestsSummary {
  /** Lessons that have a test. */
  tests: number;
  /** Lessons whose test has been submitted at least once. */
  answered: number;
  /** Combined score 0..100 over the answered tests (questions-weighted), null when nothing answered. */
  scorePercent: number | null;
  /** Correct answers / total questions over ALL tests (unanswered count as 0 correct). */
  correct: number;
  totalQuestions: number;
  /** Every test answered and the combined score reaches the passing score. */
  passed: boolean;
}

export function summarizeLessonTests(results: readonly LessonTestResult[], passingScore: number): LessonTestsSummary {
  const withTest = results.filter((r) => r.questionCount > 0);
  const answeredTests = withTest.filter((r) => r.bestScore !== null);
  const totalQuestions = withTest.reduce((n, r) => n + r.questionCount, 0);
  const answeredQuestions = answeredTests.reduce((n, r) => n + r.questionCount, 0);
  // Round to whole questions: a best score is always k/n of that test's questions
  const correct = answeredTests.reduce((n, r) => n + Math.round(((r.bestScore ?? 0) / 100) * r.questionCount), 0);
  const scorePercent = answeredQuestions > 0 ? round2((correct / answeredQuestions) * 100) : null;
  const allAnswered = withTest.length > 0 && answeredTests.length === withTest.length;
  const overall = totalQuestions > 0 ? (correct / totalQuestions) * 100 : 0;
  return {
    tests: withTest.length,
    answered: answeredTests.length,
    scorePercent,
    correct,
    totalQuestions,
    passed: allAnswered && overall + 1e-9 >= passingScore,
  };
}

/** Whether a lesson's own test is "done" enough to move on, per the course rule. */
export function lessonTestSatisfied(rule: CompletionRule, test: { required: boolean; passed: boolean; submitted: boolean }): boolean {
  if (!test.required) return true;
  return rule === "lesson_tests_average" ? test.submitted : test.passed;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
