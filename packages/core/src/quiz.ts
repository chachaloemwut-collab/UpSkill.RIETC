/**
 * Quiz engine (spec 5.3 #3), with these additions:
 *  - shuffle using a CSPRNG (crypto.randomInt), not Math.random
 *  - option ids are remapped per attempt -> sharing answers like "Q1 = c" across people doesn't work
 *  - the snapshot stores the answer key (server only); grading always uses the snapshot
 */
import { randomBytes, randomInt } from "node:crypto";

export interface QuestionOption {
  id: string;
  text: string;
}
export interface QuestionRecord {
  id: string;
  questionText: string;
  options: QuestionOption[];
  correctOptionId: string;
}

/** Stored in quiz_attempts.questions_snapshot (server side) */
export interface AttemptSnapshotItem {
  questionId: string;
  questionText: string;
  options: QuestionOption[]; // ids are already remapped
  correctOptionId: string; // remapped id
}

/** What gets sent to the client */
export interface ClientQuestion {
  questionId: string;
  questionText: string;
  options: QuestionOption[];
}

function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function buildAttemptSnapshot(questions: readonly QuestionRecord[]): AttemptSnapshotItem[] {
  return shuffle(questions).map((q) => {
    if (!q.options.some((o) => o.id === q.correctOptionId)) {
      throw new Error(`question ${q.id}: correct option not among options`);
    }
    let correct = "";
    const options = shuffle(q.options).map((o) => {
      const newId = randomBytes(4).toString("hex");
      if (o.id === q.correctOptionId) correct = newId;
      return { id: newId, text: o.text };
    });
    return { questionId: q.id, questionText: q.questionText, options, correctOptionId: correct };
  });
}

export function toClientQuestions(snapshot: readonly AttemptSnapshotItem[]): ClientQuestion[] {
  // Build new objects explicitly (don't use spread/delete) so the answer key can't leak if fields are added later
  return snapshot.map((s) => ({
    questionId: s.questionId,
    questionText: s.questionText,
    options: s.options.map((o) => ({ id: o.id, text: o.text })),
  }));
}

export function gradeAttempt(
  snapshot: readonly AttemptSnapshotItem[],
  answers: Readonly<Record<string, string>>,
): { correct: number; total: number; scorePercentage: number } {
  const total = snapshot.length;
  const correct = snapshot.filter((s) => answers[s.questionId] === s.correctOptionId).length;
  const scorePercentage = total === 0 ? 0 : Math.round((correct / total) * 10000) / 100;
  return { correct, total, scorePercentage };
}
