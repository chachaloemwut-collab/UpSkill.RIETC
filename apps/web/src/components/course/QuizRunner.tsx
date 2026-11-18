"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Award, Bookmark, ChevronLeft, ChevronRight, Flag, LayoutList, RotateCcw, Shuffle, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, AlertDialog, Badge, Button, Card, Progress, ProgressRing, Skeleton, buttonClass, confettiFrom } from "@/components/ui";

interface Question {
  questionId: string;
  questionText: string;
  options: Array<{ id: string; text: string }>;
}
interface Attempt {
  attemptId: string;
  expiresAt: string;
  questions: Question[];
  focusEventCount: number;
  kind: "pre" | "lesson" | "post";
}
interface Result {
  scorePercentage: number;
  passed: boolean;
  late?: boolean;
  passingScore?: number;
  kind?: "pre" | "lesson" | "post";
  focusEventCount?: number;
  courseCompleted?: boolean;
  lessonTests?: { tests: number; answered: number; correct: number; totalQuestions: number; passed: boolean } | null;
}

const LETTERS = "ABCDEFGH";

export function QuizRunner({
  courseId,
  slug,
  passingScore,
  timeLimitMin,
  assessmentKind = "post",
  lessonId,
  averageRule = false,
  continueHref,
}: {
  courseId: string;
  slug: string;
  passingScore: number;
  timeLimitMin: number;
  assessmentKind?: "pre" | "lesson" | "post";
  lessonId?: string | undefined;
  /** Course passes on the combined end-of-lesson score: answering moves the learner on, retakes raise the score. */
  averageRule?: boolean;
  /** Where "continue" goes after a lesson test (next lesson, or the course page). */
  continueHref?: string | undefined;
}) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"list" | "focus">("list");
  const [focusIndex, setFocusIndex] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ringRef = useRef<HTMLDivElement>(null);
  const attemptStartedAtRef = useRef(0);
  const lastFocusEventAtRef = useRef(0);
  const activeAttemptId = attempt?.attemptId;

  const toggleFlag = (qid: string) => {
    setFlagged((prev) => ({ ...prev, [qid]: !prev[qid] }));
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (result?.passed && ringRef.current) confettiFrom(ringRef.current, { count: 140 });
  }, [result]);

  useEffect(() => {
    if (!activeAttemptId) return;
    const record = (eventType: "hidden" | "pagehide") => {
      const eventAt = Date.now();
      if (eventAt - lastFocusEventAtRef.current < 1_000) return;
      lastFocusEventAtRef.current = eventAt;
      setAttempt((current) => current ? { ...current, focusEventCount: current.focusEventCount + 1 } : current);
      void api<{ focusEventCount: number }>(`/api/courses/${courseId}/assessments/focus`, {
        body: {
          attempt_id: activeAttemptId,
          event_type: eventType,
          elapsed_sec: Math.max(0, Math.floor((eventAt - attemptStartedAtRef.current) / 1000)),
        },
      }).then((response) => {
        if (response.ok) setAttempt((current) => current ? { ...current, focusEventCount: response.data.focusEventCount } : current);
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") record("hidden");
    };
    const onPageHide = () => record("pagehide");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [activeAttemptId, courseId]);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api<Attempt>(`/api/courses/${courseId}/assessments/start`, {
      body: { kind: assessmentKind, ...(lessonId ? { lesson_id: lessonId } : {}) },
    });
    setBusy(false);
    if (r.ok) {
      setAttempt(r.data);
      attemptStartedAtRef.current = Date.now();
      setAnswers({});
      setFlagged({});
      setFocusIndex(0);
      setResult(null);
      window.scrollTo({ top: 0 });
    } else setError(r.message);
  }

  async function submit() {
    if (!attempt) return;
    setBusy(true);
    const r = await api<Result>(`/api/courses/${courseId}/assessments/submit`, { body: { attempt_id: attempt.attemptId, answers } });
    setBusy(false);
    if (r.ok) {
      setResult(r.data);
      setAttempt(null);
      window.scrollTo({ top: 0 });
    } else setError(r.message);
  }

  if (busy && !attempt && !result) {
    return (
      <div className="grid gap-5 p-4">
        <Card className="p-6">
          <Skeleton className="h-6 w-1/3 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-1/2 mb-4" />
              <div className="grid gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (result && assessmentKind === "lesson" && averageRule) {
    const lt = result.lessonTests;
    return (
      <Card className="grid justify-items-center gap-5 p-8 text-center">
        <div ref={ringRef}>
          <ProgressRing value={Math.round(result.scorePercentage)} size={120} stroke={10} label="คะแนน" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">
            {result.courseCompleted ? "ยินดีด้วย คุณเรียนจบหลักสูตรแล้ว!" : result.late ? "ส่งคำตอบเกินเวลาที่กำหนด" : result.passed ? "ตอบถูกทั้งหมด" : "บันทึกคำตอบแล้ว"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">คะแนนแบบทดสอบคลิปนี้ {result.scorePercentage.toFixed(0)}%</p>
          {lt && (
            <p className="mt-1 text-sm text-muted-foreground">
              คะแนนรวมทุกคลิปตอนนี้ {lt.correct}/{lt.totalQuestions} ข้อ · ทำแล้ว {lt.answered}/{lt.tests} คลิป · เกณฑ์ผ่าน {result.passingScore ?? passingScore}%
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {result.courseCompleted ? (
            <Link href={`/courses/${slug}/certificate`} className={buttonClass("default", "lg")}>
              <Award className="h-4 w-4" /> รับใบรับรอง
            </Link>
          ) : (
            <Link href={continueHref ?? `/courses/${slug}`} className={buttonClass("default", "lg")}>
              เรียนต่อ <ChevronRight className="h-4 w-4" />
            </Link>
          )}
          {!result.passed && !result.courseCompleted && (
            <Button size="lg" variant="outline" onClick={start} loading={busy}>
              <RotateCcw className="h-4 w-4" /> ทำใหม่เพื่อเพิ่มคะแนน
            </Button>
          )}
        </div>
        {!result.passed && !result.courseCompleted && <p className="text-xs text-muted-foreground">ระบบใช้คะแนนครั้งที่ดีที่สุดของแต่ละคลิปมารวมกัน</p>}
        {(result.focusEventCount ?? 0) > 0 && <Alert variant="warning" title={`พบการสลับหน้า ${result.focusEventCount} ครั้ง`}>ระบบบันทึกเหตุการณ์ไว้ประกอบการตรวจสอบแล้ว</Alert>}
        {error && <Alert variant="destructive" title={error} />}
      </Card>
    );
  }

  if (result)
    return (
      <Card className="grid justify-items-center gap-5 p-8 text-center">
        <div ref={ringRef}>
          <ProgressRing value={Math.round(result.scorePercentage)} size={120} stroke={10} label="คะแนน" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">
            {assessmentKind === "pre"
              ? "ประเมินก่อนเรียนเรียบร้อยแล้ว"
              : result.passed
                ? assessmentKind === "lesson" ? "ผ่านแบบทดสอบท้ายคลิปแล้ว" : "ยินดีด้วย คุณสอบผ่าน!"
                : result.late ? "ส่งคำตอบเกินเวลาที่กำหนด" : "ยังไม่ผ่านเกณฑ์"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            คะแนน {result.scorePercentage.toFixed(2)}% · เกณฑ์ผ่าน {result.passingScore ?? passingScore}%
          </p>
        </div>
        {assessmentKind === "pre" ? (
          <Link href={`/courses/${slug}`} className={buttonClass("default", "lg")}>เริ่มเรียน</Link>
        ) : result.passed && assessmentKind === "lesson" ? (
          <Link href={continueHref ?? `/courses/${slug}`} className={buttonClass("default", "lg")}>เรียนต่อ</Link>
        ) : result.passed ? (
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
        {(result.focusEventCount ?? 0) > 0 && <Alert variant="warning" title={`พบการสลับหน้า ${result.focusEventCount} ครั้ง`}>ระบบบันทึกเหตุการณ์ไว้ประกอบการตรวจสอบแล้ว</Alert>}
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
        <p className="text-sm text-muted-foreground">หากสลับแท็บหรือย่อหน้าต่าง ระบบจะบันทึกเหตุการณ์ไว้ในผลการสอบ</p>
        <Button size="lg" onClick={start} loading={busy} className="justify-self-start">
          เริ่มทำแบบทดสอบ
        </Button>
      </Card>
    );

  const remaining = Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - now) / 1000));
  const answered = Object.keys(answers).length;
  const total = attempt.questions.length;
  const isUrgentOrange = remaining < 180 && remaining >= 60;
  const isUrgentRed = remaining < 60;
  const currentQ = attempt.questions[focusIndex];

  return (
    <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-6 items-start">
      {/* ---------- Main Questions Area (Left Column) ---------- */}
      <div className="grid gap-4">
        {/* Sticky Header with Mode Switcher & Urgency Timer */}
        <div className="sticky top-16 z-20 grid gap-2.5 rounded-xl border border-border/80 bg-background/95 px-4 py-3 shadow-xs backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                ตอบแล้ว <strong className="font-bold tabular-nums text-primary">{answered}</strong>/{total} ข้อ
              </span>
              <div className="hidden sm:inline-flex items-center rounded-lg border bg-muted/30 p-0.5 ml-2">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    viewMode === "list" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutList className="h-3.5 w-3.5" /> ทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("focus")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    viewMode === "focus" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Bookmark className="h-3.5 w-3.5" /> ทีละข้อ
                </button>
              </div>
            </div>

            {/* Urgency Timer */}
            <Badge
              className={cn(
                "font-mono text-xs tabular-nums font-semibold px-2.5 py-1 transition-all",
                isUrgentRed
                  ? "border-destructive bg-destructive text-destructive-foreground animate-pulse"
                  : isUrgentOrange
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-border bg-secondary text-secondary-foreground"
              )}
            >
              <Timer className="h-3.5 w-3.5 mr-1 inline" />
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </Badge>
          </div>
          <Progress value={(answered / total) * 100} />
        </div>

        {error && <Alert variant="destructive" title={error} />}
        {attempt.focusEventCount > 0 && (
          <Alert variant="warning" title={`ตรวจพบการสลับหน้า ${attempt.focusEventCount} ครั้ง`}>
            กรุณาทำแบบทดสอบในหน้านี้จนเสร็จ ระบบได้บันทึกเหตุการณ์ไว้แล้ว
          </Alert>
        )}

        {/* Focus Mode: One Question at a Time */}
        {viewMode === "focus" && currentQ ? (
          <Card key={currentQ.questionId} className="animate-fade-in p-6">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/50">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                ข้อที่ {focusIndex + 1} จาก {total}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleFlag(currentQ.questionId)}
                className={cn(
                  "h-8 text-xs gap-1.5",
                  flagged[currentQ.questionId] ? "text-amber-500 font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Flag className="h-3.5 w-3.5" /> {flagged[currentQ.questionId] ? "ปักธงแล้ว" : "ปักธงทบทวน"}
              </Button>
            </div>

            <fieldset>
              <legend className="mb-5 text-base font-medium leading-relaxed">
                {currentQ.questionText}
              </legend>
              <div className="grid gap-2.5">
                {currentQ.options.map((o, oi) => {
                  const checked = answers[currentQ.questionId] === o.id;
                  return (
                    <label
                      key={o.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3.5 rounded-xl border border-border/80 bg-card p-3.5 text-sm transition-all hover:border-primary/60 hover:bg-muted/30",
                        checked && "border-primary bg-primary/5 ring-1 ring-primary font-medium"
                      )}
                    >
                      <input
                        type="radio"
                        name={currentQ.questionId}
                        value={o.id}
                        checked={checked}
                        onChange={() => setAnswers((a) => ({ ...a, [currentQ.questionId]: o.id }))}
                        className="sr-only"
                      />
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold transition-colors",
                          checked ? "border-primary bg-primary text-primary-foreground shadow-xs" : "border-border text-muted-foreground"
                        )}
                      >
                        {LETTERS[oi]}
                      </span>
                      <span className="flex-1 leading-snug">{o.text}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Focus Pagination Navigation */}
            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={focusIndex === 0}
                onClick={() => setFocusIndex((i) => Math.max(0, i - 1))}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" /> ข้อก่อนหน้า
              </Button>
              {focusIndex < total - 1 ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setFocusIndex((i) => Math.min(total - 1, i + 1))}
                  className="gap-1"
                >
                  ข้อถัดไป <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={remaining === 0}
                  onClick={() => (answered < total ? setConfirming(true) : void submit())}
                >
                  ส่งคำตอบ ({answered}/{total})
                </Button>
              )}
            </div>
          </Card>
        ) : (
          /* List Mode: All Questions */
          <div className="grid gap-4">
            {attempt.questions.map((q, i) => (
              <Card
                key={q.questionId}
                id={`question-${q.questionId}`}
                className="animate-slide-up p-5 [animation-fill-mode:both] scroll-mt-28"
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
              >
                <fieldset>
                  <legend className="mb-4 flex items-start justify-between gap-3 font-medium w-full">
                    <div className="flex gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                        {i + 1}
                      </span>
                      <span className="pt-0.5 leading-snug">{q.questionText}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFlag(q.questionId)}
                      className={cn(
                        "h-7 text-xs gap-1 shrink-0",
                        flagged[q.questionId] ? "text-amber-500 font-semibold" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Flag className="h-3 w-3" />
                      <span className="hidden sm:inline">{flagged[q.questionId] ? "ปักธงแล้ว" : "ปักธง"}</span>
                    </Button>
                  </legend>
                  <div className="grid gap-2">
                    {q.options.map((o, oi) => {
                      const checked = answers[q.questionId] === o.id;
                      return (
                        <label
                          key={o.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg border border-border/80 px-3 py-2.5 text-sm transition-all hover:bg-muted/50",
                            checked && "border-primary bg-primary/5 ring-1 ring-primary font-medium"
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
                              checked ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
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
          </div>
        )}

        <Button
          size="lg"
          className="w-full mt-2 shadow-sm"
          loading={busy}
          disabled={remaining === 0}
          onClick={() => (answered < total ? setConfirming(true) : void submit())}
        >
          ส่งคำตอบ ({answered}/{total} ข้อ)
        </Button>
      </div>

      {/* ---------- Right Column: Sticky Question Navigator Palette ---------- */}
      <aside className="mt-6 lg:mt-0 lg:sticky lg:top-20 lg:self-start">
        <Card className="p-4.5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ผังข้อสอบ (Navigator)</h3>
            <span className="text-xs font-semibold tabular-nums text-primary">
              {answered}/{total} ข้อ
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {attempt.questions.map((q, i) => {
              const isAnswered = !!answers[q.questionId];
              const isFlagged = !!flagged[q.questionId];
              const isCurrent = viewMode === "focus" && focusIndex === i;
              return (
                <button
                  key={q.questionId}
                  type="button"
                  onClick={() => {
                    if (viewMode === "focus") {
                      setFocusIndex(i);
                    } else {
                      document.getElementById(`question-${q.questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }}
                  className={cn(
                    "flex h-8 w-full items-center justify-center rounded-md border text-xs font-semibold transition-all relative",
                    isCurrent && "ring-2 ring-primary ring-offset-1 font-bold",
                    isFlagged
                      ? "border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : isAnswered
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}
                  title={`ข้อ ${i + 1}: ${isFlagged ? "ปักธงทบทวน" : isAnswered ? "ตอบแล้ว" : "ยังไม่ตอบ"}`}
                >
                  {i + 1}
                  {isFlagged && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 ring-1 ring-background" />}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-border/60 grid gap-1.5 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-primary" />
              <span>ตอบแล้ว ({answered})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-muted/60 border border-border" />
              <span>ยังไม่ตอบ ({total - answered})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-amber-500/20 border border-amber-500" />
              <span>ปักธงทบทวน ({Object.values(flagged).filter(Boolean).length})</span>
            </div>
          </div>

          <Button
            size="md"
            className="mt-4 w-full justify-center shadow-xs"
            loading={busy}
            disabled={remaining === 0}
            onClick={() => (answered < total ? setConfirming(true) : void submit())}
          >
            ส่งคำตอบ ({answered}/{total})
          </Button>
        </Card>
      </aside>

      <AlertDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="ยังตอบไม่ครบทุกข้อ"
        description={`คุณตอบแล้ว ${answered} จากทั้งหมด ${total} ข้อ โดยข้อที่ไม่ได้ตอบจะนับเป็นข้อผิด ยืนยันการส่งคำตอบหรือไม่?`}
        confirmLabel="ยืนยันการส่งคำตอบ"
        cancelLabel="กลับไปทำต่อ"
        onConfirm={() => void submit()}
      />
    </div>
  );
}
