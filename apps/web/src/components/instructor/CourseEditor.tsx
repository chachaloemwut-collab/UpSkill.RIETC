"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Award,
  Check,
  CheckCircle2,
  Circle,
  CircleHelp,
  ExternalLink,
  Eye,
  FileQuestion,
  Minus,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Settings,
  ShieldCheck,
  SquarePlay,
  Trash2,
  TriangleAlert,
  Users,
  Video,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { VISIBILITY, formatDuration, youtubeThumb } from "@/lib/format";
import {
  Alert,
  AlertDialog,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Progress,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  buttonClass,
  useToast,
} from "@/components/ui";
import { CheckpointEditorDialog } from "./CheckpointEditorDialog";
import { QuestionEditDialog, type QuestionData } from "./QuestionEditDialog";
import { CourseLearnersRoster } from "./CourseLearnersRoster";

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
    credential_enabled: boolean;
    credential_type: string;
    credential_name_th: string;
    credential_name_en: string | null;
    credential_template_key: string;
    credential_validity_days: number | null;
    credential_signer_name: string | null;
    credential_signer_title: string | null;
    credential_achievement_th: string;
    credential_achievement_en: string | null;
    credential_background_url: string | null;
    credential_text_align: string;
  };
  lessons: Array<{
    id: string;
    sequence_order: number;
    title: string;
    youtube_video_id: string;
    duration_sec: number;
    video_status: string;
    checkpoint_question: string | null;
    checkpoint_options: unknown | null;
    checkpoint_correct_index: number | null;
    checkpoint_at_sec: number | null;
  }>;
  questions: Array<{
    id: string;
    question_text: string;
    options: Array<{ id: string; text: string }>;
    correct_option_id: string;
    assessment_type: "pre" | "lesson" | "post";
    lesson_id: string | null;
  }>;
  devManualDuration: boolean;
  publishRules: { minTotalDurationSec: number; minQuestions: number };
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/,
  );
  return match && match[1] ? match[1] : null;
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
  const postQuestions = questions.filter((question) => question.assessment_type === "post");
  const base = `/api/instructor/courses/${course.id}`;
  const checks = [
    { ok: lessons.length > 0, label: "มีบทเรียนอย่างน้อย 1 บท" },
    {
      ok: course.total_duration_sec >= publishRules.minTotalDurationSec,
      label: `ความยาวรวม ≥ ${Math.round(publishRules.minTotalDurationSec / 60)} นาที (ตอนนี้ ${formatDuration(course.total_duration_sec)})`,
    },
    {
      ok: postQuestions.length >= publishRules.minQuestions,
      label: `Post-test ≥ ${publishRules.minQuestions} ข้อ (ตอนนี้ ${postQuestions.length})`,
    },
    {
      ok: lessons.length > 0 && lessons.every((l) => l.video_status === "active"),
      label: "วิดีโอทุกบทใช้งานได้",
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Tabs defaultValue="lessons" className="min-w-0">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="lessons">
            <span className="inline-flex items-center gap-1.5">
              <Video className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">บทเรียน</span> ({lessons.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="quiz">
            <span className="inline-flex items-center gap-1.5">
              <FileQuestion className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">แบบทดสอบ</span> ({questions.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="learners">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">ผู้เรียน</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="settings">
            <span className="inline-flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">ตั้งค่า & ใบประกาศ</span>
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lessons" className="mt-4">
          <LessonsSection base={base} lessons={lessons} devManualDuration={data.devManualDuration} />
        </TabsContent>

        <TabsContent value="quiz" className="mt-4">
          <QuizSection base={base} questions={questions} lessons={lessons} />
        </TabsContent>

        <TabsContent value="learners" className="mt-4">
          <CourseLearnersRoster
            courseId={course.id}
            maxAttemptsPerDay={course.max_quiz_attempts_per_day}
          />
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

function PublishSection({
  base,
  course,
  checks,
}: {
  base: string;
  course: EditorData["course"];
  checks: Array<{ ok: boolean; label: string }>;
}) {
  const a = useAction();
  const set = (visibility: string) =>
    a.run(`${base}/publish`, { method: "PATCH", body: { visibility } }, "อัปเดตสถานะแล้ว");
  const vis = VISIBILITY[course.visibility];
  const passed = checks.filter((c) => c.ok).length;

  return (
    <Card className="grid gap-4 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">การเผยแพร่</h2>
        <Badge variant={vis?.variant ?? "secondary"}>{vis?.label ?? course.visibility}</Badge>
      </div>
      <div className="grid gap-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>ความพร้อมของหลักสูตร</span>
          <span className="tabular-nums">
            {passed}/{checks.length}
          </span>
        </div>
        <Progress value={(passed / checks.length) * 100} />
      </div>
      <ul className="grid gap-2 text-sm">
        {checks.map((c) => (
          <li
            key={c.label}
            className={cn("flex items-start gap-2", c.ok ? "text-foreground" : "text-muted-foreground")}
          >
            {c.ok ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
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
              <Rocket className="h-4 w-4" /> เผยแพร่หลักสูตร
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
          {course.visibility !== "archived" && (
            <Button
              variant="outline"
              className="text-muted-foreground hover:text-foreground"
              disabled={a.busy}
              onClick={() => set("archived")}
            >
              <Archive className="h-4 w-4" /> ปิดหลักสูตร / ย้ายเข้าคลัง
            </Button>
          )}
        </div>
      )}
      <Link
        href={`/courses/${course.slug}`}
        className={buttonClass("link", "sm", "justify-self-start px-0")}
      >
        <ExternalLink className="h-3.5 w-3.5" /> ดูหน้าหลักสูตร
      </Link>
    </Card>
  );
}

function SettingsSection({ base, course }: { base: string; course: EditorData["course"] }) {
  const a = useAction();

  // Form states for live certificate preview
  const [certEnabled, setCertEnabled] = useState(course.credential_enabled);
  const [certTitleTh, setCertTitleTh] = useState(course.credential_name_th);
  const [certSigner, setCertSigner] = useState(course.credential_signer_name ?? "");
  const [certSignerTitle, setCertSignerTitle] = useState(course.credential_signer_title ?? "");
  const [certTemplate, setCertTemplate] = useState(course.credential_template_key);
  const [certAlign, setCertAlign] = useState(course.credential_text_align);
  const [certAchievement, setCertAchievement] = useState(course.credential_achievement_th);

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
          credential_enabled: f.get("credential_enabled") === "on",
          credential_type: f.get("credential_type"),
          credential_name_th: f.get("credential_name_th"),
          credential_name_en: String(f.get("credential_name_en") ?? "") || null,
          credential_template_key: f.get("credential_template_key"),
          credential_validity_days: f.get("credential_validity_days")
            ? Number(f.get("credential_validity_days"))
            : null,
          credential_signer_name: String(f.get("credential_signer_name") ?? "") || null,
          credential_signer_title: String(f.get("credential_signer_title") ?? "") || null,
          credential_achievement_th: f.get("credential_achievement_th"),
          credential_achievement_en: String(f.get("credential_achievement_en") ?? "") || null,
          credential_background_url: String(f.get("credential_background_url") ?? "") || null,
          credential_text_align: f.get("credential_text_align"),
        },
      },
      "บันทึกการตั้งค่าแล้ว",
    );
  }

  // Preview color themes
  const templateTheme =
    certTemplate === "royal"
      ? "border-sky-900/60 bg-gradient-to-b from-sky-950/10 via-background to-sky-950/20 text-sky-950 dark:text-sky-100"
      : certTemplate === "classic"
      ? "border-emerald-800/60 bg-gradient-to-b from-emerald-950/10 via-background to-emerald-950/20 text-emerald-950 dark:text-emerald-100"
      : certTemplate === "minimal"
      ? "border-slate-300 bg-background text-slate-800 dark:border-slate-800 dark:text-slate-100"
      : "border-indigo-600/50 bg-gradient-to-b from-indigo-950/10 via-background to-indigo-950/20 text-indigo-950 dark:text-indigo-100";

  return (
    <div className="grid gap-6">
      <Card className="p-5 shadow-sm">
        <form onSubmit={onSubmit} className="grid gap-5">
          <div className="border-b pb-3">
            <h3 className="font-semibold text-foreground">ข้อมูลทั่วไปและเกณฑ์การเรียน</h3>
            <p className="text-xs text-muted-foreground">
              กำหนดเกณฑ์ความคืบหน้าและการวัดผลของหลักสูตรนี้
            </p>
          </div>

          <Field label="ชื่อหลักสูตร">
            <Input name="title" defaultValue={course.title} minLength={3} maxLength={255} required />
          </Field>
          <Field label="คำอธิบายหลักสูตร">
            <Textarea name="description" defaultValue={course.description ?? ""} rows={4} />
          </Field>

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="ดูวิดีโอขั้นต่ำ (%)" hint="50–100%">
              <Input
                name="min_watch_percentage"
                type="number"
                min={50}
                max={100}
                defaultValue={course.min_watch_percentage}
              />
            </Field>
            <Field label="คะแนนสอบที่ผ่าน (%)" hint="0–100%">
              <Input
                name="passing_quiz_score"
                type="number"
                min={0}
                max={100}
                defaultValue={course.passing_quiz_score}
              />
            </Field>
            <Field label="สิทธิ์สอบต่อวัน (ครั้ง/24 ชม.)" hint="จำกัดเพื่อป้องกันการสุ่มเดา">
              <Input
                name="max_quiz_attempts_per_day"
                type="number"
                min={1}
                max={20}
                defaultValue={course.max_quiz_attempts_per_day}
              />
            </Field>
            <Field label="เวลาทำแบบทดสอบ (นาที)" hint="1–240 นาที">
              <Input
                name="quiz_time_limit_min"
                type="number"
                min={1}
                max={240}
                defaultValue={Math.round(course.quiz_time_limit_sec / 60)}
              />
            </Field>
          </div>

          <Checkbox
            name="is_sequential_locked"
            defaultChecked={course.is_sequential_locked}
            label="บังคับเรียนตามลำดับบท (ห้ามข้ามบทเรียน)"
          />

          {/* Certificate Configuration */}
          <div className="border-t pt-5">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">เอกสารรับรองดิจิทัล (Digital Certificate)</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              กำหนดรูปแบบและการจัดวางสำหรับใบประกาศนียบัตรที่ออกให้ผู้เรียนเมื่อผ่านเกณฑ์
            </p>
          </div>

          <Checkbox
            name="credential_enabled"
            checked={certEnabled}
            onChange={(e) => setCertEnabled(e.target.checked)}
            label="เปิดใช้งานการออกใบรับรองเมื่อผู้เรียนผ่านเกณฑ์"
          />

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="ชื่อเอกสารภาษาไทย">
              <Input
                name="credential_name_th"
                required
                maxLength={120}
                value={certTitleTh}
                onChange={(e) => setCertTitleTh(e.target.value)}
              />
            </Field>
            <Field label="ชื่อเอกสารภาษาอังกฤษ" hint="ไม่บังคับ">
              <Input
                name="credential_name_en"
                maxLength={120}
                defaultValue={course.credential_name_en ?? ""}
              />
            </Field>
            <Field label="รหัสประเภทเอกสาร">
              <Input
                name="credential_type"
                required
                pattern="[a-z0-9_]+"
                maxLength={40}
                defaultValue={course.credential_type}
              />
            </Field>
            <Field label="รูปแบบเทมเพลต">
              <Select
                name="credential_template_key"
                value={certTemplate}
                onChange={(e) => setCertTemplate(e.target.value)}
              >
                <option value="standard">Standard (โทนสีสถาบันทันสมัย)</option>
                <option value="classic">Classic (โทนเขียวขจี–ทองสง่างาม)</option>
                <option value="royal">Royal (โทนกรมท่า–ทองทางการ)</option>
                <option value="minimal">Minimal (โทนสเลทเรียบหรู)</option>
              </Select>
            </Field>
            <Field label="การจัดวางข้อความ">
              <Select
                name="credential_text_align"
                value={certAlign}
                onChange={(e) => setCertAlign(e.target.value)}
              >
                <option value="center">กึ่งกลาง (Center)</option>
                <option value="left">ชิดซ้าย (Left)</option>
              </Select>
            </Field>
            <Field label="อายุเอกสาร (วัน)" hint="เว้นว่างหากไม่มีวันหมดอายุ">
              <Input
                name="credential_validity_days"
                type="number"
                min={1}
                max={36500}
                defaultValue={course.credential_validity_days ?? ""}
              />
            </Field>
            <Field label="ชื่อผู้ลงนาม" hint="เว้นว่างเพื่อใช้ชื่อผู้สอน">
              <Input
                name="credential_signer_name"
                maxLength={255}
                value={certSigner}
                onChange={(e) => setCertSigner(e.target.value)}
                placeholder="เช่น ศ.ดร. มานะ อิ่มเอิบ"
              />
            </Field>
            <Field label="ตำแหน่งผู้ลงนาม" hint="ไม่บังคับ">
              <Input
                name="credential_signer_title"
                maxLength={255}
                value={certSignerTitle}
                onChange={(e) => setCertSignerTitle(e.target.value)}
                placeholder="เช่น ผู้อำนวยการสถาบันฯ"
              />
            </Field>
            <Field label="ข้อความผลสัมฤทธิ์ (ไทย)" hint="แสดงใต้ชื่อผู้รับ">
              <Input
                name="credential_achievement_th"
                maxLength={255}
                value={certAchievement}
                onChange={(e) => setCertAchievement(e.target.value)}
              />
            </Field>
            <Field label="ข้อความผลสัมฤทธิ์ (อังกฤษ)" hint="ไม่บังคับ">
              <Input
                name="credential_achievement_en"
                maxLength={255}
                defaultValue={course.credential_achievement_en ?? ""}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="ภาพพื้นหลังหรือลายน้ำ (URL)" hint="HTTPS เท่านั้น จะแสดงจางๆ ใต้เนื้อหา">
                <Input
                  name="credential_background_url"
                  type="url"
                  placeholder="https://..."
                  maxLength={500}
                  defaultValue={course.credential_background_url ?? ""}
                />
              </Field>
            </div>
          </div>

          <Button type="submit" loading={a.busy} className="justify-self-start font-medium">
            บันทึกการตั้งค่าทั้งหมด
          </Button>
        </form>
      </Card>

      {/* Live Certificate Preview Mockup */}
      <Card className="p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <h4 className="font-semibold text-foreground text-sm">
              ตัวอย่างจำลองหน้าใบประกาศนียบัตร (Live Mockup)
            </h4>
          </div>
          <Badge variant="outline" className="text-xs uppercase font-mono">
            {certTemplate} · {certAlign}
          </Badge>
        </div>

        <div
          className={cn(
            "relative mx-auto w-full max-w-2xl rounded-xl border-4 p-8 shadow-md transition-all duration-300",
            templateTheme,
            certAlign === "left" ? "text-left" : "text-center",
          )}
        >
          {/* Watermark / Seal */}
          <div className="absolute top-4 right-4 flex items-center gap-1.5 opacity-60">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="text-[10px] font-semibold tracking-wider uppercase">
              Ed25519 Verified
            </span>
          </div>

          {/* Certificate Content */}
          <div className="space-y-4 py-2">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              สถาบันการอาชีวศึกษาภาคตะวันออก · RIETC
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {certTitleTh || "ใบประกาศนียบัตรสำเร็จการศึกษา"}
            </h2>
            <p className="text-xs text-muted-foreground">มอบให้แก่</p>
            <p className="text-xl font-bold text-primary underline underline-offset-8">
              นายสมชาย พัฒนาวิชาชีพ (ตัวอย่างชื่อผู้เรียน)
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto pt-1 leading-relaxed">
              {certAchievement || "ได้ผ่านการศึกษาและประเมินผลสัมฤทธิ์ตามเกณฑ์มาตรฐานในหลักสูตร"}
            </p>
            <h3 className="text-base font-semibold text-foreground">{course.title}</h3>

            <div className="pt-6 mt-4 border-t border-border/40 flex items-end justify-between text-xs text-muted-foreground">
              <div className="text-left space-y-0.5">
                <p className="font-mono text-[10px]">รหัส: RIETC-2026-XXXX</p>
                <p className="text-[11px]">ออกให้เมื่อ: วันที่สำเร็จการศึกษา</p>
              </div>

              <div className="text-right space-y-1">
                <div className="h-0.5 w-32 border-b border-foreground/30 ml-auto" />
                <p className="font-semibold text-foreground">
                  ({certSigner || "ผู้สอนประจำหลักสูตร"})
                </p>
                {certSignerTitle && (
                  <p className="text-[11px] text-muted-foreground">{certSignerTitle}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LessonsSection({
  base,
  lessons,
  devManualDuration,
}: {
  base: string;
  lessons: EditorData["lessons"];
  devManualDuration: boolean;
}) {
  const a = useAction();
  const [replacing, setReplacing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<EditorData["lessons"][number] | null>(null);

  // Checkpoint Dialog state
  const [checkpointLesson, setCheckpointLesson] = useState<EditorData["lessons"][number] | null>(
    null,
  );

  // YouTube live thumbnail preview for the new lesson form
  const [inputUrl, setInputUrl] = useState("");
  const detectedVideoId = extractYouTubeId(inputUrl);

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const dev = Number(f.get("dev_duration_sec") || 0);
    const ok = await a.run(
      `${base}/lessons`,
      {
        body: {
          url: f.get("url"),
          title: String(f.get("title") ?? "") || undefined,
          ...(dev ? { dev_duration_sec: dev } : {}),
        },
      },
      "เพิ่มบทเรียนแล้ว",
    );
    if (ok) {
      form.reset();
      setInputUrl("");
    }
  }

  const move = (idx: number, dir: -1 | 1) => {
    const ids = lessons.map((l) => l.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
    void a.run(`${base}/lessons/order`, { method: "PUT", body: { lesson_ids: ids } });
  };

  const handleSaveCheckpoint = async (
    checkpoint: {
      question: string;
      options: string[];
      correct_index: number;
      at_sec: number;
    } | null,
  ): Promise<boolean> => {
    if (!checkpointLesson) return false;
    const ok = await a.run(
      `${base}/lessons/${checkpointLesson.id}`,
      { method: "PATCH", body: { checkpoint } },
      checkpoint ? "บันทึกคำถามระหว่างเรียนแล้ว" : "ลบคำถามระหว่างเรียนแล้ว",
    );
    if (ok) {
      setCheckpointLesson(null);
      return true;
    }
    return false;
  };

  return (
    <div className="grid gap-5">
      <Card className="shadow-sm">
        {lessons.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<SquarePlay className="h-6 w-6 text-primary" />}
              title="ยังไม่มีบทเรียนในหลักสูตรนี้"
              description="เริ่มต้นเพิ่มบทแรกโดยวางลิงก์ YouTube ที่กล่องเพิ่มบทเรียนด้านล่าง ระบบจะดึงความยาวและจัดลำดับให้อัตโนมัติ"
            />
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {lessons.map((l, i) => {
              const thumbUrl = youtubeThumb(l.youtube_video_id);
              const hasCheckpoint = !!l.checkpoint_question;

              return (
                <li key={l.id} className="grid gap-3 px-4 py-3.5 hover:bg-muted/10 transition-colors">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-foreground">
                      {l.sequence_order}
                    </span>

                    {/* Small video thumbnail */}
                    {thumbUrl && (
                      <div className="relative h-11 w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbUrl}
                          alt={l.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Play className="h-4 w-4 fill-white text-white drop-shadow" />
                        </div>
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{l.title}</p>
                        {hasCheckpoint && (
                          <Badge variant="warning" className="text-[10px] gap-1 px-1.5 py-0">
                            <CircleHelp className="h-3 w-3" /> มีคำถาม {formatDuration(l.checkpoint_at_sec ?? 0)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(l.duration_sec)} · youtu.be/{l.youtube_video_id}
                      </p>
                    </div>

                    {l.video_status !== "active" && (
                      <Badge variant="destructive">
                        <TriangleAlert className="h-3 w-3" /> วิดีโอเสีย
                      </Badge>
                    )}

                    <div className="flex items-center gap-0.5">
                      <Tooltip content="เลื่อนขึ้น">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={a.busy || i === 0}
                          onClick={() => move(i, -1)}
                          aria-label="เลื่อนขึ้น"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      <Tooltip content="เลื่อนลง">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={a.busy || i === lessons.length - 1}
                          onClick={() => move(i, 1)}
                          aria-label="เลื่อนลง"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      <Tooltip content="เปลี่ยนวิดีโอ YouTube">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setReplacing(replacing === l.id ? null : l.id)}
                          aria-label="เปลี่ยนวิดีโอ"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      <Tooltip content="ตั้งค่าคำถามหยุดคลิป (Checkpoint)">
                        <Button
                          variant={hasCheckpoint ? "secondary" : "ghost"}
                          size="icon"
                          onClick={() => setCheckpointLesson(l)}
                          aria-label="คำถามระหว่างเรียน"
                          className={cn(hasCheckpoint && "text-amber-600 dark:text-amber-400")}
                        >
                          <CircleHelp className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      <Tooltip content="ลบบทเรียนนี้">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={a.busy}
                          onClick={() => setDeleting(l)}
                          aria-label="ลบบทเรียน"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>

                  {replacing === l.id && (
                    <form
                      className="flex animate-slide-up flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        const dev = Number(f.get("dev_duration_sec") || 0);
                        if (
                          await a.run(
                            `${base}/lessons/${l.id}`,
                            {
                              method: "PATCH",
                              body: { url: f.get("url"), ...(dev ? { dev_duration_sec: dev } : {}) },
                            },
                            "เปลี่ยนวิดีโอแล้ว",
                          )
                        )
                          setReplacing(null);
                      }}
                    >
                      <Input
                        name="url"
                        placeholder="วางลิงก์ YouTube ใหม่..."
                        required
                        className="min-w-0 flex-1 bg-background text-sm"
                      />
                      {devManualDuration && (
                        <Input
                          name="dev_duration_sec"
                          type="number"
                          min={1}
                          placeholder="ความยาว (วินาที)"
                          className="w-40 bg-background text-sm"
                        />
                      )}
                      <Button type="submit" size="sm" loading={a.busy}>
                        บันทึกการเปลี่ยน
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setReplacing(null)}
                      >
                        ยกเลิก
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* Add Lesson Form with Live Thumbnail Preview */}
      <Card className="p-5 shadow-sm">
        <form onSubmit={onAdd} className="grid gap-4">
          <div className="flex items-center gap-2">
            <SquarePlay className="h-5 w-5 text-red-600 dark:text-red-400" />
            <h3 className="font-semibold text-foreground">เพิ่มบทเรียนใหม่จาก YouTube</h3>
          </div>

          <Field
            label="ลิงก์ YouTube"
            hint="รองรับ youtube.com/watch?v=, youtu.be/, shorts/ · ดึงความยาวคลิปให้อัตโนมัติ"
          >
            <Input
              name="url"
              required
              placeholder="https://www.youtube.com/watch?v=..."
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="text-sm"
            />
          </Field>

          {/* Instant Live YouTube Preview Box */}
          {detectedVideoId && (
            <div className="flex items-center gap-3.5 rounded-lg border border-red-500/30 bg-red-50/20 p-3 dark:bg-red-950/20">
              <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded border bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://i.ytimg.com/vi/${detectedVideoId}/mqdefault.jpg`}
                  alt="YouTube thumbnail preview"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Play className="h-5 w-5 fill-white text-white drop-shadow" />
                </div>
              </div>
              <div className="space-y-1">
                <Badge variant="success" className="text-[10px] gap-1">
                  <CheckCircle2 className="h-3 w-3" /> ตรวจพบคลิปวิดีโอที่ถูกต้อง
                </Badge>
                <p className="font-mono text-xs text-muted-foreground">ID: {detectedVideoId}</p>
                <a
                  href={`https://www.youtube.com/watch?v=${detectedVideoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  เปิดทดสอบคลิปในแท็บใหม่ <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="ชื่อบทเรียน" hint="เว้นว่างเพื่อใช้ชื่อคลิปจาก YouTube อัตโนมัติ">
              <Input name="title" maxLength={255} placeholder="เช่น บทนำและภาพรวม..." />
            </Field>
            {devManualDuration && (
              <Field
                label="ความยาวคลิป (วินาที)"
                hint="โหมดพัฒนา: ยังไม่ได้ตั้งค่า YOUTUBE_API_KEY"
              >
                <Input name="dev_duration_sec" type="number" min={1} required />
              </Field>
            )}
          </div>

          <Button type="submit" loading={a.busy} className="justify-self-start font-medium">
            <Plus className="h-4 w-4" /> เพิ่มบทเรียน
          </Button>
        </form>
      </Card>

      {/* Checkpoint Dialog Modal */}
      <CheckpointEditorDialog
        open={!!checkpointLesson}
        onOpenChange={(open) => !open && setCheckpointLesson(null)}
        lesson={checkpointLesson}
        onSave={handleSaveCheckpoint}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="ลบบทเรียนนี้?"
        description={
          deleting ? `“${deleting.title}” และสถิติความคืบหน้าของผู้เรียนในบทนี้จะถูกลบออก` : ""
        }
        confirmLabel="ลบบทเรียน"
        cancelLabel="ยกเลิก"
        destructive
        onConfirm={() =>
          deleting && void a.run(`${base}/lessons/${deleting.id}`, { method: "DELETE" }, "ลบบทเรียนแล้ว")
        }
      />
    </div>
  );
}

function QuizSection({
  base,
  questions,
  lessons,
}: {
  base: string;
  questions: EditorData["questions"];
  lessons: EditorData["lessons"];
}) {
  const a = useAction();
  const [optionCount, setOptionCount] = useState(4);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<QuestionData | null>(null);
  const [assessmentType, setAssessmentType] = useState<"pre" | "lesson" | "post">("post");
  const [filterType, setFilterType] = useState<"all" | "pre" | "lesson" | "post">("all");

  const preCount = questions.filter((q) => q.assessment_type === "pre").length;
  const lessonCount = questions.filter((q) => q.assessment_type === "lesson").length;
  const postCount = questions.filter((q) => q.assessment_type === "post").length;

  const filteredQuestions = questions.filter((q) => {
    if (filterType === "all") return true;
    return q.assessment_type === filterType;
  });

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const options = Array.from({ length: optionCount }, (_, i) =>
      String(f.get(`opt${i}`) ?? "").trim(),
    );
    if (options.some((o) => !o)) return;
    const lessonId = assessmentType === "lesson" ? String(f.get("lesson_id") ?? "") : undefined;
    if (assessmentType === "lesson" && !lessonId) return;

    const ok = await a.run(
      `${base}/quiz`,
      {
        body: {
          question_text: f.get("q"),
          options,
          correct_index: Number(f.get("correct")),
          assessment_type: assessmentType,
          ...(lessonId ? { lesson_id: lessonId } : {}),
        },
      },
      "เพิ่มข้อสอบแล้ว",
    );
    if (ok) form.reset();
  }

  const handleUpdateQuestion = async (
    questionId: string,
    data: {
      question_text: string;
      options: string[];
      correct_index: number;
      assessment_type: "pre" | "lesson" | "post";
      lesson_id?: string | null;
    },
  ): Promise<boolean> => {
    const ok = await a.run(
      `${base}/quiz/${questionId}`,
      {
        method: "PATCH",
        body: data,
      },
      "อัปเดตข้อสอบแล้ว",
    );
    if (ok) {
      setEditingQuestion(null);
      return true;
    }
    return false;
  };

  return (
    <div className="grid gap-5">
      {/* Category Tabs Filter */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant={filterType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("all")}
            className="text-xs h-8"
          >
            ทั้งหมด ({questions.length})
          </Button>
          <Button
            variant={filterType === "pre" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("pre")}
            className="text-xs h-8"
          >
            Pre-test ({preCount})
          </Button>
          <Button
            variant={filterType === "lesson" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("lesson")}
            className="text-xs h-8"
          >
            ระหว่างอบรม ({lessonCount})
          </Button>
          <Button
            variant={filterType === "post" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("post")}
            className="text-xs h-8"
          >
            Post-test ({postCount})
          </Button>
        </div>

        <span className="text-xs text-muted-foreground">
          แสดง {filteredQuestions.length} จาก {questions.length} ข้อ
        </span>
      </div>

      {filteredQuestions.length === 0 ? (
        <EmptyState
          icon={<FileQuestion className="h-6 w-6 text-primary" />}
          title={filterType === "all" ? "ยังไม่มีข้อสอบในหลักสูตรนี้" : `ไม่มีข้อสอบในหมวดนี้`}
          description="เพิ่มข้อสอบด้านล่าง เพื่อวัดผลสัมฤทธิ์ก่อนและหลังเรียน ระบบจะสุ่มลำดับข้อและตัวเลือกให้ผู้เรียนอัตโนมัติ"
        />
      ) : (
        <ol className="grid gap-3">
          {filteredQuestions.map((q, i) => (
            <Card key={q.id} className="p-4 shadow-sm hover:border-primary/40 transition-colors">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-foreground">
                  {i + 1}
                </span>

                <div className="mr-auto min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant={
                        q.assessment_type === "post"
                          ? "default"
                          : q.assessment_type === "pre"
                          ? "secondary"
                          : "warning"
                      }
                      className="text-[11px]"
                    >
                      {q.assessment_type === "pre"
                        ? "Pre-test"
                        : q.assessment_type === "post"
                        ? "Post-test"
                        : "ระหว่างอบรม"}
                    </Badge>
                    {q.lesson_id && (
                      <span className="text-xs text-muted-foreground">
                        {lessons.find((lesson) => lesson.id === q.lesson_id)?.title ?? "บทเรียน"}
                      </span>
                    )}
                  </div>
                  <p className="pt-0.5 text-sm font-medium text-foreground">{q.question_text}</p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Tooltip content="แก้ไขข้อสอบ">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={a.busy}
                      onClick={() =>
                        setEditingQuestion({
                          id: q.id,
                          question_text: q.question_text,
                          assessment_type: q.assessment_type,
                          lesson_id: q.lesson_id,
                          options: q.options,
                          correct_option_id: q.correct_option_id,
                        })
                      }
                      aria-label="แก้ไขข้อนี้"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                  <Tooltip content="ลบข้อสอบ">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={a.busy}
                      onClick={() => setDeleting(q.id)}
                      aria-label="ลบข้อนี้"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                </div>
              </div>

              {/* Options display with clean OVEC emerald badge */}
              <ul className="mt-3 grid gap-1.5 pl-10 sm:grid-cols-2">
                {q.options.map((o) => {
                  const correct = o.id === q.correct_option_id;
                  return (
                    <li
                      key={o.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
                        correct
                          ? "border-emerald-500/40 bg-emerald-50/60 font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : "border-border/60 bg-muted/20 text-muted-foreground",
                      )}
                    >
                      {correct ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                      ) : (
                        <Circle className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                      )}
                      <span className="truncate">{o.text}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </ol>
      )}

      {/* Add New Question Card */}
      <Card className="p-5 shadow-sm">
        <form onSubmit={onAdd} className="grid gap-4">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">เพิ่มข้อสอบใหม่</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ช่วงการประเมิน (Assessment Type)">
              <Select
                value={assessmentType}
                onChange={(event) =>
                  setAssessmentType(event.target.value as "pre" | "lesson" | "post")
                }
              >
                <option value="pre">Pre-test ก่อนเริ่มเรียน</option>
                <option value="lesson">แบบทดสอบระหว่างอบรม</option>
                <option value="post">Post-test ท้ายหลักสูตร</option>
              </Select>
            </Field>

            {assessmentType === "lesson" && (
              <Field label="ผูกกับบทเรียน">
                <Select name="lesson_id" required>
                  <option value="">เลือกบทเรียนที่ต้องการผูก</option>
                  {lessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      บทที่ {lesson.sequence_order}: {lesson.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <Field label="โจทย์คำถาม">
            <Textarea
              name="q"
              required
              minLength={3}
              rows={2}
              placeholder="พิมพ์ข้อความคำถาม เช่น ข้อใดคือความหมายที่ถูกต้องของ..."
              className="text-sm"
            />
          </Field>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              ตัวเลือกคำตอบ · คลิกปุ่มวงกลมเพื่อกำหนดตัวเลือกที่ถูกต้อง
            </legend>
            {Array.from({ length: optionCount }, (_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="correct"
                  value={i}
                  required
                  defaultChecked={i === 0}
                  aria-label={`ตัวเลือกที่ ${i + 1} ถูก`}
                  className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border border-primary/60 transition-all checked:border-[5px] checked:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Input
                  name={`opt${i}`}
                  required
                  placeholder={`ตัวเลือกที่ ${i + 1}`}
                  className="text-sm"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={optionCount >= 6}
                onClick={() => setOptionCount((n) => n + 1)}
                className="text-xs h-8"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> ตัวเลือก
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={optionCount <= 2}
                onClick={() => setOptionCount((n) => n - 1)}
                className="text-xs h-8"
              >
                <Minus className="h-3.5 w-3.5 mr-1" /> ตัวเลือก
              </Button>
            </div>
          </fieldset>

          <Button type="submit" loading={a.busy} className="justify-self-start font-medium">
            <Plus className="h-4 w-4" /> เพิ่มข้อสอบลงในหลักสูตร
          </Button>
        </form>
      </Card>

      {/* Edit Question Dialog */}
      <QuestionEditDialog
        open={!!editingQuestion}
        onOpenChange={(open) => !open && setEditingQuestion(null)}
        question={editingQuestion}
        lessons={lessons}
        onSave={handleUpdateQuestion}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="ลบข้อสอบข้อนี้?"
        description="ข้อสอบข้อนี้จะถูกลบออกจากคลังของหลักสูตรอย่างถาวร"
        confirmLabel="ลบข้อสอบ"
        cancelLabel="ยกเลิก"
        destructive
        onConfirm={() =>
          deleting && void a.run(`${base}/quiz/${deleting}`, { method: "DELETE" }, "ลบข้อสอบแล้ว")
        }
      />
    </div>
  );
}
