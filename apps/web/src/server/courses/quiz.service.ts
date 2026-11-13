/**
 * Learner quiz flow (spec 5.3 #3)
 * - start: every lesson must be completed; per-day attempt limit; resumes an open, unexpired attempt
 * - submit: graded only from the attempt snapshot; time limit enforced by the server; idempotent
 */
import "server-only";
import {
  buildAttemptSnapshot,
  gradeAttempt,
  toClientQuestions,
  type AttemptSnapshotItem,
  type QuestionOption,
} from "@upskill/core";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { addEmailToOutbox } from "../email/outbox.service";
import { HttpError } from "../http";

const SUBMIT_GRACE_MS = 30_000; // network latency allowance after the deadline

async function loadEnrollment(userId: string, courseId: string) {
  const e = await ctx()
    .db.selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .innerJoin("users as u", "u.id", "e.user_id")
    .select(["e.id", "e.status", "c.passing_quiz_score", "c.max_quiz_attempts_per_day", "c.quiz_time_limit_sec", "c.visibility", "c.title", "c.slug", "u.email", "u.legal_name_locked_at"])
    .where("e.user_id", "=", userId)
    .where("e.course_id", "=", courseId)
    .executeTakeFirst();
  if (!e || e.status === "revoked") throw new HttpError(404, "NOT_FOUND");
  if (e.visibility === "suspended" || e.visibility === "draft") throw new HttpError(403, "COURSE_UNAVAILABLE");
  return e;
}

export async function startQuiz(userId: string, courseId: string) {
  const { db } = ctx();
  const e = await loadEnrollment(userId, courseId);
  if (e.status === "completed") throw new HttpError(409, "ALREADY_PASSED");

  const progress = await db
    .selectFrom("lessons as l")
    .leftJoin("lesson_progress as p", (j) => j.onRef("p.lesson_id", "=", "l.id").on("p.enrollment_id", "=", e.id))
    .select([sql<number>`count(*)::int`.as("total"), sql<number>`count(*) filter (where p.is_completed)::int`.as("done")])
    .where("l.course_id", "=", courseId)
    .executeTakeFirstOrThrow();
  if (progress.total === 0 || progress.done < progress.total) throw new HttpError(403, "LESSONS_NOT_COMPLETED");

  return db.transaction().execute(async (trx) => {
    // Serialize concurrent "start" clicks for this enrollment
    await trx.selectFrom("enrollments").select("id").where("id", "=", e.id).forUpdate().execute();

    const open = await trx
      .selectFrom("quiz_attempts")
      .select(["id", "expires_at", "questions_snapshot"])
      .where("enrollment_id", "=", e.id)
      .where("submitted_at", "is", null)
      .executeTakeFirst();
    if (open && new Date(open.expires_at).getTime() > Date.now()) {
      return { attemptId: open.id, expiresAt: new Date(open.expires_at).toISOString(), questions: toClientQuestions(open.questions_snapshot as unknown as AttemptSnapshotItem[]) };
    }
    if (open) {
      // Expired without submitting: close it as a failed attempt
      await trx.updateTable("quiz_attempts").set({ submitted_at: new Date(), user_answers: "{}", score_percentage: "0", is_passed: false }).where("id", "=", open.id).execute();
    }

    const recent = await trx
      .selectFrom("quiz_attempts")
      .select(sql<number>`count(*)::int`.as("n"))
      .where("enrollment_id", "=", e.id)
      .where("started_at", ">", sql<Date>`now() - interval '24 hours'`)
      .executeTakeFirstOrThrow();
    if (recent.n >= e.max_quiz_attempts_per_day) throw new HttpError(429, "QUIZ_ATTEMPT_LIMIT");

    const questions = await trx
      .selectFrom("quiz_questions")
      .select(["id", "question_text", "options", "correct_option_id"])
      .where("course_id", "=", courseId)
      .where("is_active", "=", true)
      .execute();
    if (questions.length === 0) throw new HttpError(409, "QUIZ_EMPTY");

    const snapshot = buildAttemptSnapshot(
      questions.map((q) => ({ id: q.id, questionText: q.question_text, options: q.options as unknown as QuestionOption[], correctOptionId: q.correct_option_id })),
    );
    const expiresAt = new Date(Date.now() + e.quiz_time_limit_sec * 1000);
    const attempt = await trx
      .insertInto("quiz_attempts")
      .values({ enrollment_id: e.id, expires_at: expiresAt, questions_snapshot: JSON.stringify(snapshot) })
      .returning("id")
      .executeTakeFirstOrThrow();

    // The answer key stays in the DB; only questions + remapped options go to the client
    return { attemptId: attempt.id, expiresAt: expiresAt.toISOString(), questions: toClientQuestions(snapshot) };
  });
}

export async function submitQuiz(userId: string, courseId: string, attemptId: string, answers: Record<string, string>) {
  const { db, env } = ctx();
  const e = await loadEnrollment(userId, courseId);

  return db.transaction().execute(async (trx) => {
    const a = await trx
      .selectFrom("quiz_attempts")
      .select(["id", "expires_at", "submitted_at", "questions_snapshot", "score_percentage", "is_passed"])
      .where("id", "=", attemptId)
      .where("enrollment_id", "=", e.id) // IDOR: the attempt must belong to this user's enrollment
      .forUpdate()
      .executeTakeFirst();
    if (!a) throw new HttpError(404, "NOT_FOUND");
    if (a.submitted_at) return { scorePercentage: Number(a.score_percentage), passed: a.is_passed === true, alreadySubmitted: true };

    const late = Date.now() > new Date(a.expires_at).getTime() + SUBMIT_GRACE_MS;
    const snapshot = a.questions_snapshot as unknown as AttemptSnapshotItem[];
    const { scorePercentage } = late ? { scorePercentage: 0 } : gradeAttempt(snapshot, answers);
    const passed = !late && scorePercentage >= e.passing_quiz_score;

    await trx
      .updateTable("quiz_attempts")
      .set({ submitted_at: new Date(), user_answers: JSON.stringify(answers), score_percentage: scorePercentage.toFixed(2), is_passed: passed })
      .where("id", "=", a.id)
      .execute();
    if (passed) {
      await trx.updateTable("enrollments").set({ status: "completed", completed_at: new Date() }).where("id", "=", e.id).where("status", "=", "in_progress").execute();
    }
    const attempts = await trx
      .selectFrom("quiz_attempts")
      .select(sql<number>`count(*)::int`.as("n"))
      .where("enrollment_id", "=", e.id)
      .where("started_at", ">", sql<Date>`now() - interval '24 hours'`)
      .executeTakeFirstOrThrow();
    if (passed) {
      await addEmailToOutbox(
        trx,
        {
          template: "assessment-passed",
          to: e.email,
          courseTitle: e.title,
          score: scorePercentage.toFixed(2),
          certificateLink: `${env.APP_ORIGIN}/courses/${e.slug}/certificate`,
          legalNameRequired: e.legal_name_locked_at === null,
        },
        { userId, deduplicationKey: `assessment-passed:${a.id}` },
      );
    } else {
      await addEmailToOutbox(
        trx,
        {
          template: "assessment-not-passed",
          to: e.email,
          courseTitle: e.title,
          score: scorePercentage.toFixed(2),
          passingScore: String(e.passing_quiz_score),
          canRetry: attempts.n < e.max_quiz_attempts_per_day,
          quizLink: `${env.APP_ORIGIN}/courses/${e.slug}/quiz`,
        },
        { userId, deduplicationKey: `assessment-not-passed:${a.id}` },
      );
    }
    return { scorePercentage, passed, late, passingScore: e.passing_quiz_score };
  });
}
