"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Alert, Badge, Button, Card, Field, Input, formatDuration } from "@/components/ui";

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

function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(path: string, init: { method?: string; body?: unknown }, success?: string) {
    setBusy(true);
    setMsg(null);
    const r = await api(path, init);
    setBusy(false);
    if (r.ok) {
      if (success) setMsg({ tone: "success", text: success });
      router.refresh();
      return true;
    }
    setMsg({ tone: "error", text: r.message });
    return false;
  }
  const banner: ReactNode = msg && <Alert tone={msg.tone}>{msg.text}</Alert>;
  return { run, busy, banner };
}

export function CourseEditor({ data }: { data: EditorData }) {
  const { course, lessons, questions, publishRules } = data;
  const base = `/api/instructor/courses/${course.id}`;
  const publishChecks = [
    { ok: lessons.length > 0, label: "มีบทเรียนอย่างน้อย 1 บท" },
    { ok: course.total_duration_sec >= publishRules.minTotalDurationSec, label: `ความยาวรวม ≥ 10 นาที (ตอนนี้ ${formatDuration(course.total_duration_sec)})` },
    { ok: questions.length >= publishRules.minQuestions, label: `ข้อสอบ ≥ ${publishRules.minQuestions} ข้อ (ตอนนี้ ${questions.length})` },
    { ok: lessons.every((l) => l.video_status === "active"), label: "วิดีโอทุกบทใช้งานได้" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <LessonsSection base={base} lessons={lessons} devManualDuration={data.devManualDuration} />
        <QuizSection base={base} questions={questions} />
      </div>
      <div className="space-y-6">
        <PublishSection base={base} course={course} checks={publishChecks} />
        <SettingsSection base={base} course={course} />
      </div>
    </div>
  );
}

function PublishSection({ base, course, checks }: { base: string; course: EditorData["course"]; checks: Array<{ ok: boolean; label: string }> }) {
  const a = useAction();
  const set = (visibility: string) => a.run(`${base}/publish`, { method: "PATCH", body: { visibility } }, "อัปเดตสถานะแล้ว");
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">การเผยแพร่</h2>
        <Badge tone={course.visibility === "published" ? "green" : course.visibility === "suspended" ? "red" : "gray"}>{course.visibility}</Badge>
      </div>
      {a.banner}
      <ul className="space-y-1 text-sm">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "text-green-800" : "text-stone-500"}>
            {c.ok ? "✓" : "○"} {c.label}
          </li>
        ))}
      </ul>
      {course.visibility === "suspended" ? (
        <Alert tone="error">หลักสูตรถูกระงับโดยผู้ดูแลระบบ</Alert>
      ) : (
        <div className="flex flex-wrap gap-2">
          {course.visibility !== "published" && (
            <Button disabled={a.busy} onClick={() => set("published")}>
              เผยแพร่
            </Button>
          )}
          {course.visibility !== "unlisted" && (
            <Button variant="secondary" disabled={a.busy} onClick={() => set("unlisted")}>
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
      <Link href={`/courses/${course.slug}`} className="block text-sm text-green-700 underline">
        ดูหน้าหลักสูตร
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
      "บันทึกแล้ว",
    );
  }
  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-3">
        <h2 className="font-semibold">ตั้งค่าหลักสูตร</h2>
        {a.banner}
        <Field label="ชื่อหลักสูตร">
          <Input name="title" defaultValue={course.title} minLength={3} maxLength={255} required />
        </Field>
        <Field label="คำอธิบาย">
          <textarea name="description" defaultValue={course.description ?? ""} rows={4} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ดูวิดีโอขั้นต่ำ (%)">
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_sequential_locked" defaultChecked={course.is_sequential_locked} className="accent-green-700" />
          บังคับเรียนตามลำดับบท
        </label>
        <Button type="submit" disabled={a.busy}>
          บันทึก
        </Button>
      </form>
    </Card>
  );
}

function LessonsSection({ base, lessons, devManualDuration }: { base: string; lessons: EditorData["lessons"]; devManualDuration: boolean }) {
  const a = useAction();
  const [replacing, setReplacing] = useState<string | null>(null);

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
    <Card className="space-y-4">
      <h2 className="font-semibold">บทเรียน</h2>
      {a.banner}
      {lessons.length === 0 ? (
        <p className="text-sm text-stone-600">ยังไม่มีบทเรียน</p>
      ) : (
        <ol className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {lessons.map((l, i) => (
            <li key={l.id} className="space-y-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-6 text-sm text-stone-500">{l.sequence_order}</span>
                <span className="mr-auto min-w-0 flex-1 truncate text-sm">{l.title}</span>
                {l.video_status !== "active" && <Badge tone="red">วิดีโอเสีย</Badge>}
                <span className="text-xs text-stone-500">{formatDuration(l.duration_sec)}</span>
                <Button variant="ghost" className="px-2 py-1" disabled={a.busy || i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น">
                  ↑
                </Button>
                <Button variant="ghost" className="px-2 py-1" disabled={a.busy || i === lessons.length - 1} onClick={() => move(i, 1)} aria-label="เลื่อนลง">
                  ↓
                </Button>
                <Button variant="ghost" className="px-2 py-1" onClick={() => setReplacing(replacing === l.id ? null : l.id)}>
                  เปลี่ยนวิดีโอ
                </Button>
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-red-700"
                  disabled={a.busy}
                  onClick={() => confirm(`ลบบท "${l.title}"?`) && void a.run(`${base}/lessons/${l.id}`, { method: "DELETE" }, "ลบแล้ว")}
                >
                  ลบ
                </Button>
              </div>
              {replacing === l.id && (
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const dev = Number(f.get("dev_duration_sec") || 0);
                    if (await a.run(`${base}/lessons/${l.id}`, { method: "PATCH", body: { url: f.get("url"), ...(dev ? { dev_duration_sec: dev } : {}) } }, "เปลี่ยนวิดีโอแล้ว")) setReplacing(null);
                  }}
                >
                  <Input name="url" placeholder="ลิงก์ YouTube ใหม่" required className="min-w-0 flex-1" />
                  {devManualDuration && <Input name="dev_duration_sec" type="number" min={1} placeholder="ความยาว (วินาที)" className="w-40" />}
                  <Button type="submit" disabled={a.busy}>
                    บันทึก
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={onAdd} className="space-y-3 rounded-lg bg-stone-50 p-3">
        <h3 className="text-sm font-semibold">เพิ่มบทเรียนจาก YouTube</h3>
        <Field label="ลิงก์ YouTube" hint="รองรับ youtube.com/watch?v=, youtu.be/, youtube.com/shorts/ · ระบบดึงความยาวคลิปจาก YouTube โดยตรง">
          <Input name="url" required placeholder="https://www.youtube.com/watch?v=..." />
        </Field>
        <Field label="ชื่อบท (เว้นว่างเพื่อใช้ชื่อคลิป)">
          <Input name="title" maxLength={255} />
        </Field>
        {devManualDuration && (
          <Field label="ความยาวคลิป (วินาที) — โหมดพัฒนาเท่านั้น" hint="ยังไม่ได้ตั้ง YOUTUBE_API_KEY จึงต้องระบุเอง">
            <Input name="dev_duration_sec" type="number" min={1} required />
          </Field>
        )}
        <Button type="submit" disabled={a.busy}>
          เพิ่มบทเรียน
        </Button>
      </form>
    </Card>
  );
}

function QuizSection({ base, questions }: { base: string; questions: EditorData["questions"] }) {
  const a = useAction();
  const [optionCount, setOptionCount] = useState(4);

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
    <Card className="space-y-4">
      <h2 className="font-semibold">คลังข้อสอบ ({questions.length} ข้อ)</h2>
      {a.banner}
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-lg border border-stone-200 p-3 text-sm">
            <div className="flex items-start gap-2">
              <p className="mr-auto font-medium">
                {i + 1}. {q.question_text}
              </p>
              <Button variant="ghost" className="px-2 py-1 text-red-700" disabled={a.busy} onClick={() => confirm("ลบข้อนี้?") && void a.run(`${base}/quiz/${q.id}`, { method: "DELETE" })}>
                ลบ
              </Button>
            </div>
            <ul className="mt-2 space-y-1">
              {q.options.map((o) => (
                <li key={o.id} className={o.id === q.correct_option_id ? "font-medium text-green-800" : "text-stone-600"}>
                  {o.id === q.correct_option_id ? "✓" : "·"} {o.text}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <form onSubmit={onAdd} className="space-y-3 rounded-lg bg-stone-50 p-3">
        <h3 className="text-sm font-semibold">เพิ่มข้อสอบ</h3>
        <Field label="คำถาม">
          <textarea name="q" required minLength={3} rows={2} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm text-stone-700">ตัวเลือก (เลือกวงกลมหน้าข้อที่ถูก)</legend>
          {Array.from({ length: optionCount }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" value={i} required defaultChecked={i === 0} className="accent-green-700" aria-label={`ข้อ ${i + 1} ถูก`} />
              <Input name={`opt${i}`} required placeholder={`ตัวเลือกที่ ${i + 1}`} />
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="ghost" className="px-2 py-1" disabled={optionCount >= 8} onClick={() => setOptionCount((n) => n + 1)}>
              + ตัวเลือก
            </Button>
            <Button variant="ghost" className="px-2 py-1" disabled={optionCount <= 2} onClick={() => setOptionCount((n) => n - 1)}>
              − ตัวเลือก
            </Button>
          </div>
        </fieldset>
        <Button type="submit" disabled={a.busy}>
          เพิ่มข้อสอบ
        </Button>
      </form>
    </Card>
  );
}
