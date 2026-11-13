"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, Circle, ExternalLink, Minus, Plus, RefreshCw, Rocket, Trash2, TriangleAlert, SquarePlay } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { VISIBILITY, formatDuration } from "@/lib/format";
import {
  Alert, AlertDialog, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Progress, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Tooltip,
  buttonClass, useToast,
} from "@/components/ui";

export interface EditorData {
  course: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    visibility: string;
    min_watch_percentage: number;
    passing_quiz_score: number;
    is_sequential_locked: boolean;
    max_quiz_attempts_per_day: number;
    quiz_time_limit_sec: number;
    total_duration_sec: number;
    is_verified_course: boolean;
  };
  lessons: Array<{ id: string; sequence_order: number; title: string; youtube_video_id: string; duration_sec: number; video_status: string }>;
  questions: Array<{ id: string; question_text: string; options: Array<{ id: string; text: string }>; correct_option_id: string }>;
  devManualDuration: boolean;
  publishRules: { minTotalDurationSec: number; minQuestions: number };
}

/** Runs an API call, toasts the outcome and refreshes the server-rendered data. */
function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run(path: string, init: { method?: string; body?: unknown }, success?: string) {
    setBusy(true);
    const r = await api(path, init);
    setBusy(false);
    if (r.ok) {
      if (success) toast({ title: success, variant: "success" });
      router.refresh();
      return true;
    }
    toast({ title: "ทำรายการไม่สำเร็จ", description: r.message, variant: "destructive" });
    return false;
  }
  return { run, busy };
}

export function CourseEditor({ data }: { data: EditorData }) {
  const { course, lessons, questions, publishRules } = data;
  const base = `/api/instructor/courses/${course.id}`;
  const checks = [
    { ok: lessons.length > 0, label: "มีบทเรียนอย่างน้อย 1 บท" },
    { ok: course.total_duration_sec >= publishRules.minTotalDurationSec, label: `ความยาวรวม ≥ ${Math.round(publishRules.minTotalDurationSec / 60)} นาที (ตอนนี้ ${formatDuration(course.total_duration_sec)})` },
    { ok: questions.length >= publishRules.minQuestions, label: `ข้อสอบ ≥ ${publishRules.minQuestions} ข้อ (ตอนนี้ ${questions.length})` },
    { ok: lessons.length > 0 && lessons.every((l) => l.video_status === "active"), label: "วิดีโอทุกบทใช้งานได้" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Tabs defaultValue="lessons" className="min-w-0">
        <TabsList>
          <TabsTrigger value="lessons">บทเรียน ({lessons.length})</TabsTrigger>
          <TabsTrigger value="quiz">แบบทดสอบ ({questions.length})</TabsTrigger>
          <TabsTrigger value="settings">ตั้งค่า</TabsTrigger>
        </TabsList>
        <TabsContent value="lessons" className="mt-4">
          <LessonsSection base={base} lessons={lessons} devManualDuration={data.devManualDuration} />
        </TabsContent>
        <TabsContent value="quiz" className="mt-4">
          <QuizSection base={base} questions={questions} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsSection base={base} course={course} />
        </TabsContent>
      </Tabs>
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <PublishSection base={base} course={course} checks={checks} />
      </aside>
    </div>
  );
}

function PublishSection({ base, course, checks }: { base: string; course: EditorData["course"]; checks: Array<{ ok: boolean; label: string }> }) {
  const a = useAction();
  const set = (visibility: string) => a.run(`${base}/publish`, { method: "PATCH", body: { visibility } }, "อัปเดตสถานะแล้ว");
  const vis = VISIBILITY[course.visibility];
  const passed = checks.filter((c) => c.ok).length;
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">การเผยแพร่</h2>
        <Badge variant={vis?.variant ?? "secondary"}>{vis?.label ?? course.visibility}</Badge>
      </div>
      <div className="grid gap-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>ความพร้อม</span>
          <span className="tabular-nums">
            {passed}/{checks.length}
          </span>
        </div>
        <Progress value={(passed / checks.length) * 100} />
      </div>
      <ul className="grid gap-2 text-sm">
        {checks.map((c) => (
          <li key={c.label} className={cn("flex items-start gap-2", c.ok ? "text-foreground" : "text-muted-foreground")}>
            {c.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0" />}
            {c.label}
          </li>
        ))}
      </ul>
      {course.visibility === "suspended" ? (
        <Alert variant="destructive" title="หลักสูตรถูกระงับโดยผู้ดูแลระบบ" />
      ) : (
        <div className="grid gap-2">
          {course.visibility !== "published" && (
            <Button loading={a.busy} onClick={() => set("published")}>
              <Rocket className="h-4 w-4" /> เผยแพร่
            </Button>
          )}
          {course.visibility !== "unlisted" && (
            <Button variant="outline" disabled={a.busy} onClick={() => set("unlisted")}>
              เผยแพร่แบบลิงก์เท่านั้น
            </Button>
          )}
          {course.visibility !== "draft" && (
            <Button variant="ghost" disabled={a.busy} onClick={() => set("draft")}>
              กลับเป็นฉบับร่าง
            </Button>
          )}
        </div>
      )}
      <Link href={`/courses/${course.slug}`} className={buttonClass("link", "sm", "justify-self-start px-0")}>
        <ExternalLink className="h-3.5 w-3.5" /> ดูหน้าหลักสูตร
      </Link>
    </Card>
  );
}

function SettingsSection({ base, course }: { base: string; course: EditorData["course"] }) {
  const a = useAction();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await a.run(
      base,
      {
        method: "PATCH",
        body: {
          title: f.get("title"),
          description: String(f.get("description") ?? "") || null,
          min_watch_percentage: Number(f.get("min_watch_percentage")),
          passing_quiz_score: Number(f.get("passing_quiz_score")),
          max_quiz_attempts_per_day: Number(f.get("max_quiz_attempts_per_day")),
          quiz_time_limit_sec: Number(f.get("quiz_time_limit_min")) * 60,
          is_sequential_locked: f.get("is_sequential_locked") === "on",
        },
      },
      "บันทึกการตั้งค่าแล้ว",
    );
  }
  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field label="ชื่อหลักสูตร">
          <Input name="title" defaultValue={course.title} minLength={3} maxLength={255} required />
        </Field>
        <Field label="คำอธิบาย">
          <Textarea name="description" defaultValue={course.description ?? ""} rows={5} />
        </Field>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="ดูวิดีโอขั้นต่ำ (%)" hint="50–100">
            <Input name="min_watch_percentage" type="number" min={50} max={100} defaultValue={course.min_watch_percentage} />
          </Field>
          <Field label="คะแนนผ่าน (%)">
            <Input name="passing_quiz_score" type="number" min={0} max={100} defaultValue={course.passing_quiz_score} />
          </Field>
          <Field label="สอบได้ (ครั้ง/วัน)">
            <Input name="max_quiz_attempts_per_day" type="number" min={1} max={20} defaultValue={course.max_quiz_attempts_per_day} />
          </Field>
          <Field label="เวลาสอบ (นาที)">
            <Input name="quiz_time_limit_min" type="number" min={1} max={240} defaultValue={Math.round(course.quiz_time_limit_sec / 60)} />
          </Field>
        </div>
        <Checkbox name="is_sequential_locked" defaultChecked={course.is_sequential_locked} label="บังคับเรียนตามลำดับบท" />
        <Button type="submit" loading={a.busy} className="justify-self-start">
          บันทึกการตั้งค่า
        </Button>
      </form>
    </Card>
  );
}

function LessonsSection({ base, lessons, devManualDuration }: { base: string; lessons: EditorData["lessons"]; devManualDuration: boolean }) {
  const a = useAction();
  const [replacing, setReplacing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<EditorData["lessons"][number] | null>(null);

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const dev = Number(f.get("dev_duration_sec") || 0);
    const ok = await a.run(
      `${base}/lessons`,
      { body: { url: f.get("url"), title: String(f.get("title") ?? "") || undefined, ...(dev ? { dev_duration_sec: dev } : {}) } },
      "เพิ่มบทเรียนแล้ว",
    );
    if (ok) form.reset();
  }

  const move = (idx: number, dir: -1 | 1) => {
    const ids = lessons.map((l) => l.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
    void a.run(`${base}/lessons/order`, { method: "PUT", body: { lesson_ids: ids } });
  };

  return (
    <div className="grid gap-4">
      <Card>
        {lessons.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<SquarePlay className="h-5 w-5" />} title="ยังไม่มีบทเรียน" description="เพิ่มบทแรกจากลิงก์ YouTube ด้านล่าง" />
          </div>
        ) : (
          <ol className="divide-y">
            {lessons.map((l, i) => (
              <li key={l.id} className="grid gap-3 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">{l.sequence_order}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDuration(l.duration_sec)} · youtu.be/{l.youtube_video_id}
                    </p>
                  </div>
                  {l.video_status !== "active" && (
                    <Badge variant="destructive">
                      <TriangleAlert className="h-3 w-3" /> วิดีโอเสีย
                    </Badge>
                  )}
                  <div className="flex items-center">
                    <Tooltip content="เลื่อนขึ้น">
                      <Button variant="ghost" size="icon" disabled={a.busy || i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น">
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="เลื่อนลง">
                      <Button variant="ghost" size="icon" disabled={a.busy || i === lessons.length - 1} onClick={() => move(i, 1)} aria-label="เลื่อนลง">
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="เปลี่ยนวิดีโอ">
                      <Button variant="ghost" size="icon" onClick={() => setReplacing(replacing === l.id ? null : l.id)} aria-label="เปลี่ยนวิดีโอ">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="ลบบทเรียน">
                      <Button variant="ghost" size="icon" disabled={a.busy} onClick={() => setDeleting(l)} aria-label="ลบบทเรียน" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </div>
                {replacing === l.id && (
                  <form
                    className="flex animate-slide-up flex-wrap gap-2 rounded-md bg-muted/50 p-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const dev = Number(f.get("dev_duration_sec") || 0);
                      if (await a.run(`${base}/lessons/${l.id}`, { method: "PATCH", body: { url: f.get("url"), ...(dev ? { dev_duration_sec: dev } : {}) } }, "เปลี่ยนวิดีโอแล้ว"))
                        setReplacing(null);
                    }}
                  >
                    <Input name="url" placeholder="ลิงก์ YouTube ใหม่" required className="min-w-0 flex-1 bg-background" />
                    {devManualDuration && <Input name="dev_duration_sec" type="number" min={1} placeholder="ความยาว (วินาที)" className="w-40 bg-background" />}
                    <Button type="submit" loading={a.busy}>
                      บันทึก
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="p-5">
        <form onSubmit={onAdd} className="grid gap-4">
          <div className="flex items-center gap-2">
            <SquarePlay className="h-5 w-5 text-destructive" />
            <h3 className="font-semibold">เพิ่มบทเรียนจาก YouTube</h3>
          </div>
          <Field label="ลิงก์ YouTube" hint="รองรับ youtube.com/watch?v=, youtu.be/, youtube.com/shorts/ · ระบบดึงความยาวคลิปให้อัตโนมัติ">
            <Input name="url" required placeholder="https://www.youtube.com/watch?v=..." />
          </Field>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="ชื่อบท" hint="เว้นว่างเพื่อใช้ชื่อคลิป">
              <Input name="title" maxLength={255} />
            </Field>
            {devManualDuration && (
              <Field label="ความยาวคลิป (วินาที)" hint="โหมดพัฒนา: ยังไม่ได้ตั้ง YOUTUBE_API_KEY">
                <Input name="dev_duration_sec" type="number" min={1} required />
              </Field>
            )}
          </div>
          <Button type="submit" loading={a.busy} className="justify-self-start">
            <Plus className="h-4 w-4" /> เพิ่มบทเรียน
          </Button>
        </form>
      </Card>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="ลบบทเรียนนี้?"
        description={deleting ? `“${deleting.title}” และความคืบหน้าของผู้เรียนในบทนี้จะถูกลบ` : ""}
        confirmLabel="ลบบทเรียน"
        cancelLabel="ยกเลิก"
        destructive
        onConfirm={() => deleting && void a.run(`${base}/lessons/${deleting.id}`, { method: "DELETE" }, "ลบบทเรียนแล้ว")}
      />
    </div>
  );
}

function QuizSection({ base, questions }: { base: string; questions: EditorData["questions"] }) {
  const a = useAction();
  const [optionCount, setOptionCount] = useState(4);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const options = Array.from({ length: optionCount }, (_, i) => String(f.get(`opt${i}`) ?? "").trim());
    if (options.some((o) => !o)) return;
    const ok = await a.run(`${base}/quiz`, { body: { question_text: f.get("q"), options, correct_index: Number(f.get("correct")) } }, "เพิ่มข้อสอบแล้ว");
    if (ok) form.reset();
  }

  return (
    <div className="grid gap-4">
      {questions.length === 0 ? (
        <EmptyState title="ยังไม่มีข้อสอบ" description="เพิ่มคำถามแบบปรนัยด้านล่าง ระบบจะสุ่มลำดับข้อและตัวเลือกให้ผู้เรียนแต่ละคน" />
      ) : (
        <ol className="grid gap-3">
          {questions.map((q, i) => (
            <Card key={q.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">{i + 1}</span>
                <p className="mr-auto pt-0.5 text-sm font-medium">{q.question_text}</p>
                <Button variant="ghost" size="icon" disabled={a.busy} onClick={() => setDeleting(q.id)} aria-label="ลบข้อนี้" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <ul className="mt-3 grid gap-1.5 pl-10 sm:grid-cols-2">
                {q.options.map((o) => {
                  const correct = o.id === q.correct_option_id;
                  return (
                    <li key={o.id} className={cn("flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm", correct ? "border-success/40 bg-success/10 text-success" : "text-muted-foreground")}>
                      {correct ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3.5 w-3.5 shrink-0" />}
                      {o.text}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </ol>
      )}

      <Card className="p-5">
        <form onSubmit={onAdd} className="grid gap-4">
          <h3 className="font-semibold">เพิ่มข้อสอบ</h3>
          <Field label="คำถาม">
            <Textarea name="q" required minLength={3} rows={2} />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">ตัวเลือก · เลือกวงกลมหน้าคำตอบที่ถูก</legend>
            {Array.from({ length: optionCount }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="correct"
                  value={i}
                  required
                  defaultChecked={i === 0}
                  aria-label={`ตัวเลือกที่ ${i + 1} ถูก`}
                  className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border border-primary/60 transition-all checked:border-[5px] checked:border-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Input name={`opt${i}`} required placeholder={`ตัวเลือกที่ ${i + 1}`} />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" disabled={optionCount >= 8} onClick={() => setOptionCount((n) => n + 1)}>
                <Plus className="h-3.5 w-3.5" /> ตัวเลือก
              </Button>
              <Button variant="outline" size="sm" disabled={optionCount <= 2} onClick={() => setOptionCount((n) => n - 1)}>
                <Minus className="h-3.5 w-3.5" /> ตัวเลือก
              </Button>
            </div>
          </fieldset>
          <Button type="submit" loading={a.busy} className="justify-self-start">
            <Plus className="h-4 w-4" /> เพิ่มข้อสอบ
          </Button>
        </form>
      </Card>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="ลบข้อสอบข้อนี้?"
        confirmLabel="ลบ"
        cancelLabel="ยกเลิก"
        destructive
        onConfirm={() => deleting && void a.run(`${base}/quiz/${deleting}`, { method: "DELETE" }, "ลบข้อสอบแล้ว")}
      />
    </div>
  );
}
