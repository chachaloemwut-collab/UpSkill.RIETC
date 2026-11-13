"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alert, Button, Card } from "@/components/ui";

interface Question {
  questionId: string;
  questionText: string;
  options: Array<{ id: string; text: string }>;
}
interface Attempt {
  attemptId: string;
  expiresAt: string;
  questions: Question[];
}
interface Result {
  scorePercentage: number;
  passed: boolean;
  late?: boolean;
  passingScore?: number;
}

export function QuizRunner({ courseId, slug }: { courseId: string; slug: string }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api<Attempt>(`/api/courses/${courseId}/quiz/start`, { method: "POST" });
    setBusy(false);
    if (r.ok) {
      setAttempt(r.data);
      setAnswers({});
      setResult(null);
    } else setError(r.message);
  }

  async function submit() {
    if (!attempt) return;
    setBusy(true);
    const r = await api<Result>(`/api/courses/${courseId}/quiz/submit`, { body: { attempt_id: attempt.attemptId, answers } });
    setBusy(false);
    if (r.ok) {
      setResult(r.data);
      setAttempt(null);
    } else setError(r.message);
  }

  if (result)
    return (
      <Card className="space-y-4">
        {result.passed ? (
          <Alert tone="success">สอบผ่าน! คะแนน {result.scorePercentage.toFixed(2)}%</Alert>
        ) : (
          <Alert tone="error">
            {result.late ? "ส่งคำตอบเกินเวลาที่กำหนด" : `ยังไม่ผ่าน คะแนน ${result.scorePercentage.toFixed(2)}%`}
            {result.passingScore !== undefined && ` (เกณฑ์ ${result.passingScore}%)`}
          </Alert>
        )}
        {result.passed ? (
          <Link href={`/courses/${slug}/certificate`} className="inline-block rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white">
            รับใบรับรอง →
          </Link>
        ) : (
          <Button onClick={start} disabled={busy}>
            ทำแบบทดสอบอีกครั้ง
          </Button>
        )}
      </Card>
    );

  if (!attempt)
    return (
      <Card className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <p className="text-stone-700">เมื่อกดเริ่ม ระบบจะเริ่มจับเวลาทันที ข้อสอบและตัวเลือกจะถูกสุ่มลำดับสำหรับคุณ</p>
        <Button onClick={start} disabled={busy}>
          เริ่มทำแบบทดสอบ
        </Button>
      </Card>
    );

  const remaining = Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - now) / 1000));
  const answered = Object.keys(answers).length;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-xl border border-stone-200 bg-white/95 px-4 py-2 text-sm shadow-sm backdrop-blur">
        <span>
          ตอบแล้ว {answered}/{attempt.questions.length}
        </span>
        <span className={remaining < 60 ? "font-semibold text-red-700" : "text-stone-700"}>
          เหลือเวลา {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
        </span>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {attempt.questions.map((q, i) => (
        <Card key={q.questionId}>
          <fieldset>
            <legend className="mb-3 font-medium">
              {i + 1}. {q.questionText}
            </legend>
            <div className="space-y-2">
              {q.options.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 px-3 py-2 hover:bg-stone-50 has-[:checked]:border-green-600 has-[:checked]:bg-green-50">
                  <input
                    type="radio"
                    name={q.questionId}
                    value={o.id}
                    checked={answers[q.questionId] === o.id}
                    onChange={() => setAnswers((a) => ({ ...a, [q.questionId]: o.id }))}
                    className="mt-1 accent-green-700"
                  />
                  <span>{o.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      ))}
      <Button
        className="w-full"
        disabled={busy || remaining === 0}
        onClick={() => {
          if (answered < attempt.questions.length && !confirm("ยังตอบไม่ครบทุกข้อ ต้องการส่งคำตอบหรือไม่?")) return;
          void submit();
        }}
      >
        ส่งคำตอบ
      </Button>
    </div>
  );
}
