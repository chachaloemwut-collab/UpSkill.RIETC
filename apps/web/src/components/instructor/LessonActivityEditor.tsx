"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Eye, ChevronRight, Upload } from "lucide-react";
import { Button, Dialog, Field, Input, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

type ActivityType = "question" | "content" | "pause" | "section" | "summary";

interface ActivityRow {
  id: string;
  activity_type: ActivityType;
  position_sec: number;
  sequence_order: number;
  content: Record<string, unknown>;
  policy: Record<string, unknown>;
  draft_content: Record<string, unknown> | null;
  draft_policy: Record<string, unknown> | null;
  published_at: string | null;
  is_active: boolean;
}

export interface LessonActivityEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  lesson: {
    id: string;
    title: string;
    duration_sec: number;
  } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtSec(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const TYPE_LABELS: Record<ActivityType, string> = {
  question: "คำถาม",
  content: "เนื้อหา",
  pause: "หยุดพัก",
  section: "หัวข้อ",
  summary: "สรุป",
};

// ── Question form ─────────────────────────────────────────────────────────────

function QuestionForm({
  initial,
  durationSec,
  onSave,
  onCancel,
  hasDraft,
}: {
  initial: ActivityRow | null;
  durationSec: number;
  onSave: (data: {
    content: Record<string, unknown>;
    policy: Record<string, unknown>;
    position_sec: number;
    save_as_draft?: boolean;
  }) => Promise<void>;
  onCancel: () => void;
  hasDraft: boolean;
}) {
  const toast = useToast();
  const existing = initial?.content as { question?: string; options?: string[]; correct_index?: number } | undefined;

  const [question, setQuestion] = useState(existing?.question ?? "");
  const [options, setOptions] = useState<string[]>(existing?.options ?? ["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(existing?.correct_index ?? 0);
  const [posSec, setPosSec] = useState(initial?.position_sec ?? Math.floor(durationSec / 2));
  const [saveAsDraft, setSaveAsDraft] = useState(hasDraft);
  const [busy, setBusy] = useState(false);

  const addOption = () => { if (options.length < 8) setOptions([...options, ""]); };
  const removeOption = (i: number) => {
    if (options.length <= 2) return;
    const next = options.filter((_, j) => j !== i);
    setOptions(next);
    if (correctIndex >= next.length) setCorrectIndex(next.length - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 3) { toast({ variant: "destructive", title: "คำถามสั้นเกินไป" }); return; }
    const cleaned = options.map((o) => o.trim());
    if (cleaned.some((o) => !o)) { toast({ variant: "destructive", title: "กรุณากรอกตัวเลือกให้ครบ" }); return; }
    if (posSec <= 0 || posSec >= durationSec) { toast({ variant: "destructive", title: "เวลาไม่ถูกต้อง" }); return; }
    setBusy(true);
    try {
      await onSave({
        position_sec: posSec,
        content: { question: question.trim(), options: cleaned, correct_index: correctIndex },
        policy: initial?.policy ?? { mode: "required", scoring: { points: 10, penalty_per_wrong: 2, max_attempts: 3 }, on_lock: { rewatch_sec: 60 } },
        save_as_draft: saveAsDraft,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-1">
      <div className="rounded-xl border border-border/80 bg-muted/40 p-3 space-y-2">
        <label className="text-xs font-medium text-muted-foreground">ตำแหน่งในวิดีโอ (วินาที) — ความยาวรวม {fmtSec(durationSec)}</label>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={durationSec - 1}
            value={posSec}
            onChange={(e) => setPosSec(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-28 font-mono text-sm"
            aria-label="ตำแหน่ง"
          />
          <span className="text-sm text-muted-foreground">= {fmtSec(posSec)}</span>
          {[0.25, 0.5, 0.75].map((pct) => (
            <Button key={pct} type="button" variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => setPosSec(Math.max(1, Math.floor(durationSec * pct)))}>
              {pct * 100}%
            </Button>
          ))}
        </div>
      </div>

      <Field label="คำถาม">
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} required placeholder="เช่น สาระสำคัญของเนื้อหาในช่วงนี้คือข้อใด?" className="text-sm" />
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ตัวเลือก · คลิกวงกลมเพื่อกำหนดคำตอบที่ถูก</span>
          <span className="text-xs text-muted-foreground">{options.length}/8</span>
        </div>
        {options.map((opt, i) => (
          <div key={i} className={cn("flex items-center gap-2 rounded-lg border p-2 transition-colors",
            correctIndex === i ? "border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-border bg-card")}>
            <button type="button" onClick={() => setCorrectIndex(i)}
              className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-all",
                correctIndex === i ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/30 hover:border-primary text-muted-foreground")}>
              {correctIndex === i ? "✓" : i + 1}
            </button>
            <Input value={opt} onChange={(e) => { const u = [...options]; u[i] = e.target.value; setOptions(u); }}
              required placeholder={`ตัวเลือกที่ ${i + 1}`} className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-1" />
            {options.length > 2 && (
              <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(i)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={options.length >= 8} onClick={addOption} className="text-xs h-7">
          + เพิ่มตัวเลือก
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input type="checkbox" checked={saveAsDraft} onChange={(e) => setSaveAsDraft(e.target.checked)} className="rounded" />
        <span>บันทึกเป็นแบบร่าง (ผู้เรียนยังไม่เห็น)</span>
      </label>

      <div className="flex items-center justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" size="sm" loading={busy}>
          {saveAsDraft ? "บันทึกร่าง" : "บันทึกและเผยแพร่"}
        </Button>
      </div>
    </form>
  );
}

// ── Main editor ────────────────────────────────────────────────────────────────

function EditorContent({ courseId, lesson, onClose }: { courseId: string; lesson: NonNullable<LessonActivityEditorProps["lesson"]>; onClose: () => void }) {
  const toast = useToast();
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ActivityRow | "new" | null>(null);
  const [preview, setPreview] = useState<ActivityRow | null>(null);
  const [fetchTick, setFetchTick] = useState(0);

  const baseUrl = `/api/instructor/courses/${courseId}/lessons/${lesson.id}/activities`;

  const load = useCallback(() => { setFetchTick((t) => t + 1); setLoading(true); }, []);

  useEffect(() => {
    let cancelled = false;
    api<ActivityRow[]>(baseUrl).then((r) => {
      if (cancelled) return;
      if (r.ok && Array.isArray(r)) setActivities(r as unknown as ActivityRow[]);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // fetchTick in deps so mutations can trigger a re-fetch
  }, [baseUrl, fetchTick]);

  const handleSave = async (data: {
    content: Record<string, unknown>;
    policy: Record<string, unknown>;
    position_sec: number;
    save_as_draft?: boolean;
  }) => {
    if (editing === "new") {
      const r = await api(baseUrl, { body: { activity_type: "question", ...data, publish_immediately: !data.save_as_draft } });
      if (!r.ok) { toast({ variant: "destructive", title: "สร้างไม่ได้", description: r.message }); return; }
      toast({ title: "สร้างกิจกรรมแล้ว" });
    } else if (editing) {
      const r = await api(`${baseUrl}/${editing.id}`, { method: "PATCH", body: data });
      if (!r.ok) { toast({ variant: "destructive", title: "แก้ไขไม่ได้", description: r.message }); return; }
      toast({ title: "บันทึกแล้ว" });
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (a: ActivityRow) => {
    if (!confirm(`ลบกิจกรรม "${TYPE_LABELS[a.activity_type]}" ที่ ${fmtSec(a.position_sec)}?`)) return;
    const r = await api(`${baseUrl}/${a.id}`, { method: "DELETE" });
    if (!r.ok) { toast({ variant: "destructive", title: "ลบไม่ได้", description: r.message }); return; }
    toast({ title: "ลบแล้ว" });
    load();
  };

  const handlePublishDraft = async (a: ActivityRow) => {
    const r = await api(`${baseUrl}/${a.id}/publish`, { body: {} });
    if (!r.ok) { toast({ variant: "destructive", title: "เผยแพร่ไม่ได้", description: r.message }); return; }
    toast({ title: "เผยแพร่แล้ว" });
    load();
  };

  if (editing !== null) {
    return (
      <div>
        <button onClick={() => setEditing(null)} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="h-3.5 w-3.5 rotate-180" /> กลับรายการ
        </button>
        <p className="font-medium text-sm mb-3">{editing === "new" ? "เพิ่มกิจกรรมใหม่" : `แก้ไขกิจกรรม (${fmtSec((editing as ActivityRow).position_sec)})`}</p>
        <QuestionForm
          initial={editing === "new" ? null : editing}
          durationSec={lesson.duration_sec}
          hasDraft={editing !== "new" && !!(editing as ActivityRow).draft_content}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">กำลังโหลด…</p>
      ) : activities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">ยังไม่มีกิจกรรมในบทนี้</p>
          <p className="text-xs text-muted-foreground mt-1">สร้างคำถามระหว่างเรียนหรือสื่อเสริมได้ที่ปุ่มด้านล่าง</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
              <span className="font-mono text-xs text-muted-foreground w-12 shrink-0 tabular-nums">{fmtSec(a.position_sec)}</span>
              <span className="flex-1 text-sm font-medium">
                {TYPE_LABELS[a.activity_type]}
                {a.activity_type === "question" && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    — {String((a.content as { question?: string }).question ?? "").slice(0, 50)}{(String((a.content as { question?: string }).question ?? "").length > 50) ? "…" : ""}
                  </span>
                )}
              </span>
              {a.draft_content && (
                <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] px-2 py-0.5 font-medium">ร่าง</span>
              )}
              {!a.published_at && !a.draft_content && (
                <span className="rounded-full bg-muted text-muted-foreground text-[10px] px-2 py-0.5">ยังไม่เผยแพร่</span>
              )}
              <div className="flex items-center gap-1">
                {a.draft_content && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700" title="เผยแพร่ร่าง"
                    onClick={() => handlePublishDraft(a)}>
                    <Upload className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="ดูตัวอย่าง"
                  onClick={() => setPreview(preview?.id === a.id ? null : a)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="แก้ไข"
                  onClick={() => setEditing(a)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="ลบ"
                  onClick={() => handleDelete(a)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity preview (inline) */}
      {preview && preview.activity_type === "question" && (
        <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2">ตัวอย่างผู้เรียน @ {fmtSec(preview.position_sec)}</p>
          <p className="text-sm font-medium text-foreground">{String((preview.content as { question?: string }).question ?? "")}</p>
          <div className="mt-2 space-y-1.5">
            {((preview.content as { options?: string[] }).options ?? []).map((opt, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-lg border border-border p-2 text-xs">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 text-[10px]">
                  {String.fromCharCode(65 + i)}
                </div>
                <span>{opt}</span>
                {i === (preview.content as { correct_index?: number }).correct_index && (
                  <span className="ml-auto text-[10px] text-emerald-600 font-medium">✓ เฉลย</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <Button type="button" onClick={() => setEditing("new")} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> เพิ่มกิจกรรม
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>ปิด</Button>
      </div>
    </div>
  );
}

export function LessonActivityEditor({ open, onOpenChange, courseId, lesson }: LessonActivityEditorProps) {
  if (!lesson) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`กิจกรรมระหว่างเรียน — ${lesson.title}`}
      description="จัดการคำถาม เนื้อหา และกิจกรรมที่จะแสดงระหว่างเล่นวิดีโอ"
    >
      <EditorContent key={lesson.id} courseId={courseId} lesson={lesson} onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
