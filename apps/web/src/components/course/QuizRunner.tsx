"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Award, RotateCcw, Shuffle, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, AlertDialog, Badge, Button, Card, Progress, ProgressRing, buttonClass, confettiFrom } from "@/components/ui";

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

const LETTERS = "ABCDEFGH";

export function QuizRunner({ courseId, slug, passingScore, timeLimitMin }: { courseId: string; slug: string; passingScore: number; timeLimitMin: number }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (result?.passed && ringRef.current) confettiFrom(ringRef.current, { count: 140 });
  }, [result]);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api<Attempt>(`/api/courses/${courseId}/quiz/start`, { method: "POST" });
    setBusy(false);
    if (r.ok) {
      setAttempt(r.data);
      setAnswers({});
      setResult(null);
      window.scrollTo({ top: 0 });
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
      window.scrollTo({ top: 0 });
    } else setError(r.message);
  }

  if (result)
    return (
      <Card className="grid justify-items-center gap-5 p-8 text-center">
        <div ref={ringRef}>
          <ProgressRing value={Math.round(result.scorePercentage)} size={120} stroke={10} label="คะแนน" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{result.passed ? "ยินดีด้วย คุณสอบผ่าน!" : result.late ? "ส่งคำตอบเกินเวลาที่กำหนด" : "ยังไม่ผ่านเกณฑ์"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            คะแนน {result.scorePercentage.toFixed(2)}% · เกณฑ์ผ่าน {result.passingScore ?? passingScore}%
          </p>
        </div>
        {result.passed ? (
          <Link href={`/courses/${slug}/certificate`} className={buttonClass("default", "lg")}>
            <Award className="h-4 w-4" /> รับใบรับรอง
          </Link>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={start} loading={busy}>
              <RotateCcw className="h-4 w-4" /> ทำแบบทดสอบอีกครั้ง
            </Button>
            <Link href={`/courses/${slug}`} className={buttonClass("outline", "lg")}>
              ทบทวนบทเรียน
            </Link>
          </div>
        )}
        {error && <Alert variant="destructive" title={error} />}
      </Card>
    );

  if (!attempt)
    return (
      <Card className="grid gap-5 p-6">
        {error && <Alert variant="destructive" title={error} />}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Timer, label: "เวลาทำ", value: `${timeLimitMin} นาที` },
            { icon: Award, label: "เกณฑ์ผ่าน", value: `${passingScore}%` },
            { icon: Shuffle, label: "ลำดับข้อ", value: "สุ่มทุกครั้ง" },
          ].map((x) => (
            <div key={x.label} className="flex items-center gap-3 rounded-lg border p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <x.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{x.label}</p>
                <p className="font-semibold">{x.value}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">เมื่อกดเริ่ม ระบบจะจับเวลาทันที และส่งคำตอบไม่ได้หลังหมดเวลา</p>
        <Button size="lg" onClick={start} loading={busy} className="justify-self-start">
          เริ่มทำแบบทดสอบ
        </Button>
      </Card>
    );

  const remaining = Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - now) / 1000));
  const answered = Object.keys(answers).length;
  const total = attempt.questions.length;

  return (
    <div className="grid gap-4">
      <div className="sticky top-16 z-10 grid gap-2 rounded-lg border bg-background/90 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between text-sm">
          <span>
            ตอบแล้ว <span className="font-semibold tabular-nums">{answered}</span>/{total} ข้อ
          </span>
          <Badge variant={remaining < 60 ? "destructive" : "secondary"} className="tabular-nums">
            <Timer className="h-3.5 w-3.5" /> {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </Badge>
        </div>
        <Progress value={(answered / total) * 100} />
      </div>
      {error && <Alert variant="destructive" title={error} />}
      {attempt.questions.map((q, i) => (
        <Card key={q.questionId} className="animate-slide-up p-5 [animation-fill-mode:both]" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
          <fieldset>
            <legend className="mb-4 flex gap-3 font-medium">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums">{i + 1}</span>
              <span className="pt-0.5">{q.questionText}</span>
            </legend>
            <div className="grid gap-2">
              {q.options.map((o, oi) => {
                const checked = answers[q.questionId] === o.id;
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-[background-color,border-color,box-shadow] hover:bg-muted/50",
                      checked && "border-primary bg-accent ring-1 ring-primary",
                    )}
                  >
                    <input
                      type="radio"
                      name={q.questionId}
                      value={o.id}
                      checked={checked}
                      onChange={() => setAnswers((a) => ({ ...a, [q.questionId]: o.id }))}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-medium transition-colors",
                        checked ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                      )}
                    >
                      {LETTERS[oi]}
                    </span>
                    <span>{o.text}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </Card>
      ))}
      <Button size="lg" className="w-full" loading={busy} disabled={remaining === 0} onClick={() => (answered < total ? setConfirming(true) : void submit())}>
        ส่งคำตอบ
      </Button>
      <AlertDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="ยังตอบไม่ครบทุกข้อ"
        description={`ตอบแล้ว ${answered} จาก ${total} ข้อ ข้อที่ไม่ได้ตอบจะนับเป็นข้อผิด ต้องการส่งคำตอบหรือไม่?`}
        confirmLabel="ส่งคำตอบ"
        cancelLabel="กลับไปทำต่อ"
        onConfirm={() => void submit()}
      />
    </div>
  );
}
