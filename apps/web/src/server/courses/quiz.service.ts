/** Multi-stage assessment flow: pre-test, per-lesson checks, and post-test. */
import "server-only";
import {
  type CompletionRule,
  buildAttemptSnapshot,
  gradeAttempt,
  toClientQuestions,
  type AttemptSnapshotItem,
  type QuestionOption,
} from "@upskill/core";
import { sql, type Database, type Tx } from "@upskill/db";
import { ctx } from "../context";
import { addEmailToOutbox } from "../email/outbox.service";
import { HttpError } from "../http";
import { asCompletionRule, lessonTestsSummaryFor, tryCompleteByLessonTests } from "./completion.service";

const SUBMIT_GRACE_MS = 30_000;
export type AssessmentKind = "pre" | "lesson" | "post";
export interface AssessmentTarget {
  kind: AssessmentKind;
  lessonId?: string | undefined;
}

function targetLesson(target: AssessmentTarget): string | null {
  if (target.kind === "lesson") {
    if (!target.lessonId) throw new HttpError(400, "ASSESSMENT_TARGET_REQUIRED");
    return target.lessonId;
  }
  if (target.lessonId) throw new HttpError(400, "ASSESSMENT_TARGET_INVALID");
  return null;
}

async function loadEnrollment(userId: string, courseId: string) {
  const e = await ctx()
    .db.selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .innerJoin("users as u", "u.id", "e.user_id")
    .select([
      "e.id", "e.status", "c.passing_quiz_score", "c.max_quiz_attempts_per_day", "c.quiz_time_limit_sec",
      "c.visibility", "c.title", "c.slug", "c.completion_rule", "u.email", "u.legal_name_locked_at",
    ])
    .where("e.user_id", "=", userId)
    .where("e.course_id", "=", courseId)
    .executeTakeFirst();
  if (!e || e.status === "revoked") throw new HttpError(404, "NOT_FOUND");
  if (e.visibility === "suspended" || e.visibility === "draft") throw new HttpError(403, "COURSE_UNAVAILABLE");
  return e;
}

async function requirePreTestIfConfigured(db: Database | Tx, enrollmentId: string, courseId: string) {
  const state = await db
    .selectFrom("courses as c")
    .select([
      sql<number>`(select count(*)::int from quiz_questions q where q.course_id = c.id and q.assessment_type = 'pre' and q.is_active)`.as("questions"),
      sql<number>`(select count(*)::int from quiz_attempts a where a.enrollment_id = ${enrollmentId} and a.assessment_type = 'pre' and a.submitted_at is not null)`.as("attempts"),
    ])
    .where("c.id", "=", courseId)
    .executeTakeFirstOrThrow();
  if (state.questions > 0 && state.attempts === 0) throw new HttpError(403, "PRE_TEST_REQUIRED");
}

async function assertAssessmentGate(db: Database, enrollmentId: string, courseId: string, target: AssessmentTarget, lessonId: string | null, rule: CompletionRule) {
  if (target.kind === "pre") {
    const done = await db
      .selectFrom("quiz_attempts")
      .select("id")
      .where("enrollment_id", "=", enrollmentId)
      .where("assessment_type", "=", "pre")
      .where("submitted_at", "is not", null)
      .executeTakeFirst();
    if (done) throw new HttpError(409, "PRE_TEST_ALREADY_COMPLETED");
    return;
  }

  await requirePreTestIfConfigured(db, enrollmentId, courseId);

  if (target.kind === "post" && rule === "lesson_tests_average") {
    throw new HttpError(409, "POST_TEST_NOT_USED", "หลักสูตรนี้วัดผลจากแบบทดสอบท้ายคลิปรวมกัน ไม่มีแบบทดสอบท้ายหลักสูตร");
  }

  if (target.kind === "lesson") {
    const lesson = await db
      .selectFrom("lessons as l")
      .leftJoin("lesson_progress as p", (j) => j.onRef("p.lesson_id", "=", "l.id").on("p.enrollment_id", "=", enrollmentId))
      .select(["l.id", "p.is_completed"])
      .where("l.id", "=", lessonId!)
      .where("l.course_id", "=", courseId)
      .executeTakeFirst();
    if (!lesson) throw new HttpError(404, "NOT_FOUND");
    if (!lesson.is_completed) throw new HttpError(403, "LESSON_NOT_COMPLETED");
    return;
  }

  const progress = await db
    .selectFrom("lessons as l")
    .leftJoin("lesson_progress as p", (j) => j.onRef("p.lesson_id", "=", "l.id").on("p.enrollment_id", "=", enrollmentId))
    .select([sql<number>`count(*)::int`.as("total"), sql<number>`count(*) filter (where p.is_completed)::int`.as("done")])
    .where("l.course_id", "=", courseId)
    .executeTakeFirstOrThrow();
  if (progress.total === 0 || progress.done < progress.total) throw new HttpError(403, "LESSONS_NOT_COMPLETED");

  const pendingLessonTests = await db
    .selectFrom("lessons as l")
    .select(sql<number>`count(*)::int`.as("n"))
    .where("l.course_id", "=", courseId)
    .where((eb) => eb.exists(eb.selectFrom("quiz_questions as q").select("q.id").whereRef("q.lesson_id", "=", "l.id").where("q.assessment_type", "=", "lesson").where("q.is_active", "=", true)))
    .where((eb) => eb.not(eb.exists(eb.selectFrom("quiz_attempts as a").select("a.id").where("a.enrollment_id", "=", enrollmentId).whereRef("a.lesson_id", "=", "l.id").where("a.assessment_type", "=", "lesson").where("a.is_passed", "=", true))))
    .executeTakeFirstOrThrow();
  if (pendingLessonTests.n > 0) throw new HttpError(403, "LESSON_TESTS_NOT_PASSED");
}

export async function startAssessment(userId: string, courseId: string, target: AssessmentTarget) {
  const { db } = ctx();
  const lessonId = targetLesson(target);
  const e = await loadEnrollment(userId, courseId);
  if (e.status === "completed") throw new HttpError(409, "ALREADY_PASSED");
  await assertAssessmentGate(db, e.id, courseId, target, lessonId, asCompletionRule(e.completion_rule));

  return db.transaction().execute(async (trx) => {
    await trx.selectFrom("enrollments").select("id").where("id", "=", e.id).forUpdate().execute();

    const open = await trx
      .selectFrom("quiz_attempts")
      .select(["id", "expires_at", "questions_snapshot", "assessment_type", "lesson_id", "focus_event_count"])
      .where("enrollment_id", "=", e.id)
      .where("submitted_at", "is", null)
      .executeTakeFirst();
    if (open && new Date(open.expires_at).getTime() > Date.now()) {
      if (open.assessment_type !== target.kind || open.lesson_id !== lessonId) throw new HttpError(409, "ASSESSMENT_IN_PROGRESS");
      return {
        attemptId: open.id,
        expiresAt: new Date(open.expires_at).toISOString(),
        questions: toClientQuestions(open.questions_snapshot as unknown as AttemptSnapshotItem[]),
        focusEventCount: open.focus_event_count,
        kind: target.kind,
      };
    }
    if (open) {
      await trx.updateTable("quiz_attempts").set({ submitted_at: new Date(), user_answers: "{}", score_percentage: "0", is_passed: false }).where("id", "=", open.id).execute();
    }

    let recentQuery = trx
      .selectFrom("quiz_attempts")
      .select(sql<number>`count(*)::int`.as("n"))
      .where("enrollment_id", "=", e.id)
      .where("assessment_type", "=", target.kind)
      .where("started_at", ">", sql<Date>`now() - interval '24 hours'`);
    recentQuery = lessonId ? recentQuery.where("lesson_id", "=", lessonId) : recentQuery.where("lesson_id", "is", null);
    const recent = await recentQuery.executeTakeFirstOrThrow();
    if (recent.n >= e.max_quiz_attempts_per_day) throw new HttpError(429, "QUIZ_ATTEMPT_LIMIT");

    let questionQuery = trx
      .selectFrom("quiz_questions")
      .select(["id", "question_text", "options", "correct_option_id"])
      .where("course_id", "=", courseId)
      .where("assessment_type", "=", target.kind)
      .where("is_active", "=", true);
    questionQuery = lessonId ? questionQuery.where("lesson_id", "=", lessonId) : questionQuery.where("lesson_id", "is", null);
    const questions = await questionQuery.execute();
    if (questions.length === 0) throw new HttpError(409, "QUIZ_EMPTY");

    const snapshot = buildAttemptSnapshot(
      questions.map((q) => ({ id: q.id, questionText: q.question_text, options: q.options as unknown as QuestionOption[], correctOptionId: q.correct_option_id })),
    );
    const expiresAt = new Date(Date.now() + e.quiz_time_limit_sec * 1000);
    const attempt = await trx
      .insertInto("quiz_attempts")
      .values({ enrollment_id: e.id, assessment_type: target.kind, lesson_id: lessonId, expires_at: expiresAt, questions_snapshot: JSON.stringify(snapshot) })
      .returning("id")
      .executeTakeFirstOrThrow();

    return { attemptId: attempt.id, expiresAt: expiresAt.toISOString(), questions: toClientQuestions(snapshot), focusEventCount: 0, kind: target.kind };
  });
}

export async function submitAssessment(userId: string, courseId: string, attemptId: string, answers: Record<string, string>) {
  const { db, env } = ctx();
  const e = await loadEnrollment(userId, courseId);

  return db.transaction().execute(async (trx) => {
    const a = await trx
      .selectFrom("quiz_attempts")
      .select(["id", "expires_at", "submitted_at", "questions_snapshot", "score_percentage", "is_passed", "assessment_type", "lesson_id", "focus_event_count"])
      .where("id", "=", attemptId)
      .where("enrollment_id", "=", e.id)
      .forUpdate()
      .executeTakeFirst();
    if (!a) throw new HttpError(404, "NOT_FOUND");
    const kind = a.assessment_type as AssessmentKind;
    if (a.submitted_at) {
      return { scorePercentage: Number(a.score_percentage), passed: a.is_passed === true, alreadySubmitted: true, kind, focusEventCount: a.focus_event_count };
    }

    const late = Date.now() > new Date(a.expires_at).getTime() + SUBMIT_GRACE_MS;
    const snapshot = a.questions_snapshot as unknown as AttemptSnapshotItem[];
    const { scorePercentage } = late ? { scorePercentage: 0 } : gradeAttempt(snapshot, answers);
    const passed = kind === "pre" ? true : !late && scorePercentage >= e.passing_quiz_score;

    await trx
      .updateTable("quiz_attempts")
      .set({ submitted_at: new Date(), user_answers: JSON.stringify(answers), score_percentage: scorePercentage.toFixed(2), is_passed: passed })
      .where("id", "=", a.id)
      .execute();

    const rule = asCompletionRule(e.completion_rule);
    let courseCompleted = false;
    if (kind === "post" && passed) {
      courseCompleted = true;
      await trx.updateTable("enrollments").set({ status: "completed", completed_at: new Date() }).where("id", "=", e.id).where("status", "=", "in_progress").execute();
    }

    let attemptsQuery = trx
      .selectFrom("quiz_attempts")
      .select(sql<number>`count(*)::int`.as("n"))
      .where("enrollment_id", "=", e.id)
      .where("assessment_type", "=", kind)
      .where("started_at", ">", sql<Date>`now() - interval '24 hours'`);
    attemptsQuery = a.lesson_id ? attemptsQuery.where("lesson_id", "=", a.lesson_id) : attemptsQuery.where("lesson_id", "is", null);
    const attempts = await attemptsQuery.executeTakeFirstOrThrow();

    if (kind === "post" && passed) {
      await addEmailToOutbox(
        trx,
        {
          template: "assessment-passed", to: e.email, courseTitle: e.title, score: scorePercentage.toFixed(2),
          certificateLink: `${env.APP_ORIGIN}/courses/${e.slug}/certificate`, legalNameRequired: e.legal_name_locked_at === null,
        },
        { userId, deduplicationKey: `assessment-passed:${a.id}` },
      );
    } else if (kind === "post") {
      await addEmailToOutbox(
        trx,
        {
          template: "assessment-not-passed", to: e.email, courseTitle: e.title, score: scorePercentage.toFixed(2),
          passingScore: String(e.passing_quiz_score), canRetry: attempts.n < e.max_quiz_attempts_per_day,
          quizLink: `${env.APP_ORIGIN}/courses/${e.slug}/quiz`,
        },
        { userId, deduplicationKey: `assessment-not-passed:${a.id}` },
      );
    } else if (kind === "lesson" && rule === "lesson_tests_average") {
      courseCompleted = await tryCompleteByLessonTests(trx, e.id);
    } else if (kind === "lesson" && passed) {
      const readiness = await trx
        .selectFrom("enrollments as enrollment")
        .select([
          sql<number>`(select count(*)::int from lessons l where l.course_id = enrollment.course_id)`.as("total"),
          sql<number>`(select count(*)::int from lesson_progress p join lessons l on l.id = p.lesson_id where p.enrollment_id = enrollment.id and l.course_id = enrollment.course_id and p.is_completed)`.as("done"),
          sql<number>`(select count(*)::int from lessons l where l.course_id = enrollment.course_id
            and exists (select 1 from quiz_questions q where q.lesson_id = l.id and q.assessment_type = 'lesson' and q.is_active)
            and not exists (select 1 from quiz_attempts pending where pending.enrollment_id = enrollment.id and pending.lesson_id = l.id and pending.assessment_type = 'lesson' and pending.is_passed))`.as("pending_tests"),
        ])
        .where("enrollment.id", "=", e.id)
        .executeTakeFirstOrThrow();
      if (readiness.total > 0 && readiness.done === readiness.total && readiness.pending_tests === 0) {
        await addEmailToOutbox(
          trx,
          { template: "ready-for-quiz", to: e.email, courseTitle: e.title, quizLink: `${env.APP_ORIGIN}/courses/${e.slug}/quiz` },
          { userId, deduplicationKey: `ready-for-quiz:${e.id}` },
        );
      }
    }
    const lessonTests = kind === "lesson" && rule === "lesson_tests_average" ? await lessonTestsSummaryFor(trx, e.id, courseId, e.passing_quiz_score) : null;
    return { scorePercentage, passed, late, passingScore: e.passing_quiz_score, kind, focusEventCount: a.focus_event_count, courseCompleted, lessonTests };
  });
}

export async function recordAssessmentFocus(
  userId: string,
  courseId: string,
  attemptId: string,
  eventType: "hidden" | "pagehide",
  elapsedSec: number,
) {
  const { db } = ctx();
  return db.transaction().execute(async (trx) => {
    const attempt = await trx
      .selectFrom("quiz_attempts as a")
      .innerJoin("enrollments as e", "e.id", "a.enrollment_id")
      .select(["a.id", "a.submitted_at", "a.focus_event_count"])
      .where("a.id", "=", attemptId)
      .where("e.user_id", "=", userId)
      .where("e.course_id", "=", courseId)
      .forUpdate("a")
      .executeTakeFirst();
    if (!attempt) throw new HttpError(404, "NOT_FOUND");
    if (attempt.submitted_at) return { focusEventCount: attempt.focus_event_count };
    const count = attempt.focus_event_count + 1;
    await trx.updateTable("quiz_attempts").set({ focus_event_count: count }).where("id", "=", attempt.id).execute();
    await trx.insertInto("assessment_focus_events").values({ attempt_id: attempt.id, user_id: userId, event_type: eventType, elapsed_sec: Math.max(0, Math.floor(elapsedSec)) }).execute();
    return { focusEventCount: count };
  });
}

export const startQuiz = (userId: string, courseId: string) => startAssessment(userId, courseId, { kind: "post" });
export const submitQuiz = (userId: string, courseId: string, attemptId: string, answers: Record<string, string>) =>
  submitAssessment(userId, courseId, attemptId, answers);
