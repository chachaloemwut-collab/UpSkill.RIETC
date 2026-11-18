/**
 * Course completion by the "lesson_tests_average" rule (no post-test): every lesson watched in full,
 * every end-of-lesson test answered, and the combined best score >= passing_quiz_score.
 * The pure scoring lives in @upskill/core (summarizeLessonTests) so the UI and the server agree.
 */
import "server-only";
import { summarizeLessonTests, type CompletionRule, type LessonTestsSummary } from "@upskill/core";
import { sql, type Database, type Tx } from "@upskill/db";
import { ctx } from "../context";
import { addEmailToOutbox } from "../email/outbox.service";

export function asCompletionRule(value: string): CompletionRule {
  return value === "lesson_tests_average" ? "lesson_tests_average" : "post_test";
}

/** Per-lesson test results for one enrollment: question count + best submitted score. */
export async function lessonTestResults(db: Database | Tx, enrollmentId: string, courseId: string) {
  return db
    .selectFrom("lessons as l")
    .select([
      "l.id",
      sql<number>`(select count(*)::int from quiz_questions q where q.lesson_id = l.id and q.assessment_type = 'lesson' and q.is_active)`.as("question_count"),
      sql<string | null>`(select max(a.score_percentage)::text from quiz_attempts a
        where a.enrollment_id = ${enrollmentId} and a.lesson_id = l.id and a.assessment_type = 'lesson' and a.submitted_at is not null)`.as("best_score"),
    ])
    .where("l.course_id", "=", courseId)
    .orderBy("l.sequence_order")
    .execute();
}

export async function lessonTestsSummaryFor(db: Database | Tx, enrollmentId: string, courseId: string, passingScore: number): Promise<LessonTestsSummary> {
  const rows = await lessonTestResults(db, enrollmentId, courseId);
  return summarizeLessonTests(
    rows.map((r) => ({ questionCount: r.question_count, bestScore: r.best_score === null ? null : Number(r.best_score) })),
    passingScore,
  );
}

/**
 * Marks the enrollment completed when the course uses lesson_tests_average and every condition holds.
 * Safe to call after any progress event (lesson completed, checkpoint passed, lesson test submitted).
 * Returns true only when this call completed the enrollment.
 */
export async function tryCompleteByLessonTests(trx: Tx, enrollmentId: string): Promise<boolean> {
  const { env } = ctx();
  const e = await trx
    .selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .innerJoin("users as u", "u.id", "e.user_id")
    .select([
      "e.id", "e.status", "e.user_id", "c.id as course_id", "c.completion_rule", "c.passing_quiz_score", "c.title", "c.slug",
      "u.email", "u.legal_name_locked_at",
      sql<number>`(select count(*)::int from lessons l where l.course_id = c.id)`.as("total"),
      sql<number>`(select count(*)::int from lesson_progress p join lessons l on l.id = p.lesson_id where p.enrollment_id = e.id and l.course_id = c.id and p.is_completed)`.as("done"),
    ])
    .where("e.id", "=", enrollmentId)
    .forUpdate("e")
    .executeTakeFirst();
  if (!e || e.status !== "in_progress" || asCompletionRule(e.completion_rule) !== "lesson_tests_average") return false;
  if (e.total === 0 || e.done < e.total) return false;

  const summary = await lessonTestsSummaryFor(trx, e.id, e.course_id, e.passing_quiz_score);
  if (!summary.passed) return false;

  await trx.updateTable("enrollments").set({ status: "completed", completed_at: new Date() }).where("id", "=", e.id).where("status", "=", "in_progress").execute();
  await addEmailToOutbox(
    trx,
    {
      template: "assessment-passed", to: e.email, courseTitle: e.title, score: (summary.scorePercent ?? 0).toFixed(2),
      certificateLink: `${env.APP_ORIGIN}/courses/${e.slug}/certificate`, legalNameRequired: e.legal_name_locked_at === null,
    },
    { userId: e.user_id, deduplicationKey: `assessment-passed:lesson-average:${e.id}` },
  );
  return true;
}
