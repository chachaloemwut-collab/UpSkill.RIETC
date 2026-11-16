"use client";

import { useState } from "react";
import { Eye, Trash2, HelpCircle } from "lucide-react";
import {
  Button,
  Dialog,
  Field,
  Input,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/utils";

export interface CheckpointLessonData {
  id: string;
  title: string;
  duration_sec: number;
  checkpoint_question: string | null;
  checkpoint_options: unknown;
  checkpoint_correct_index: number | null;
  checkpoint_at_sec: number | null;
}

export interface CheckpointEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: CheckpointLessonData | null;
  onSave: (checkpoint: {
    question: string;
    options: string[];
    correct_index: number;
    at_sec: number;
  } | null) => Promise<boolean>;
}

function parseOptions(raw: unknown): string[] {
  let opts: string[] = ["", "", "", ""];
  if (Array.isArray(raw)) {
    opts = raw as string[];
  } else if (typeof raw === "string") {
    try {
      opts = JSON.parse(raw);
    } catch {
      opts = raw.split("\n").filter(Boolean);
    }
  }
  return opts.length >= 2 ? opts : ["", ""];
}

function CheckpointForm({
  lesson,
  onSave,
  onClose,
}: {
  lesson: CheckpointLessonData;
  onSave: CheckpointEditorDialogProps["onSave"];
  onClose: () => void;
}) {
  const toast = useToast();
  const [question, setQuestion] = useState(lesson.checkpoint_question ?? "");
  const [options, setOptions] = useState<string[]>(() => parseOptions(lesson.checkpoint_options));
  const [correctIndex, setCorrectIndex] = useState(lesson.checkpoint_correct_index ?? 0);

  const totalSec = lesson.checkpoint_at_sec ?? (Math.floor(lesson.duration_sec / 2) || 60);
  const [minutes, setMinutes] = useState(Math.floor(totalSec / 60));
  const [seconds, setSeconds] = useState(totalSec % 60);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const totalAtSec = minutes * 60 + seconds;

  const setPresetPercent = (pct: number) => {
    const targetSec = Math.max(5, Math.floor(lesson.duration_sec * pct));
    setMinutes(Math.floor(targetSec / 60));
    setSeconds(targetSec % 60);
  };

  const updateOptionText = (idx: number, text: string) => {
    const updated = [...options];
    updated[idx] = text;
    setOptions(updated);
  };

  const addOption = () => {
    if (options.length < 6) {
      setOptions([...options, ""]);
    }
  };

  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    const updated = options.filter((_, i) => i !== idx);
    setOptions(updated);
    if (correctIndex >= updated.length) {
      setCorrectIndex(updated.length - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 3) {
      toast({
        variant: "destructive",
        title: "ข้อมูลไม่ครบ",
        description: "กรุณากรอกคำถามอย่างน้อย 3 ตัวอักษร",
      });
      return;
    }

    const cleanedOptions = options.map((o) => o.trim());
    if (cleanedOptions.some((o) => !o)) {
      toast({
        variant: "destructive",
        title: "ตัวเลือกไม่สมบูรณ์",
        description: "กรุณากรอกข้อความให้ครบทุกตัวเลือก หรือลบตัวเลือกที่ว่างออก",
      });
      return;
    }

    if (totalAtSec <= 0 || totalAtSec >= lesson.duration_sec) {
      toast({
        variant: "destructive",
        title: "เวลาไม่ถูกต้อง",
        description: `กำหนดเวลาต้องอยู่ระหว่าง 00:01 ถึง ${Math.floor(lesson.duration_sec / 60)}:${String(lesson.duration_sec % 60).padStart(2, "0")}`,
      });
      return;
    }

    setBusy(true);
    try {
      const ok = await onSave({
        question: question.trim(),
        options: cleanedOptions,
        correct_index: correctIndex,
        at_sec: totalAtSec,
      });
      if (ok) {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("คุณต้องการลบคำถามระหว่างเรียนของบทนี้หรือไม่?")) return;
    setBusy(true);
    try {
      const ok = await onSave(null);
      if (ok) {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="checkpoint-form" onSubmit={handleSubmit} className="space-y-4 py-1">
      {/* Target Video & Time Selection */}
      <div className="rounded-xl border border-border/80 bg-muted/40 p-3.5 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">บทเรียน: {lesson.title}</span>
          <span className="text-muted-foreground tabular-nums">
            ความยาวรวม {Math.floor(lesson.duration_sec / 60)}:
            {String(lesson.duration_sec % 60).padStart(2, "0")} นาที
          </span>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            เวลาที่จะให้วิดีโอหยุดถาม (นาที : วินาที)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={Math.floor(lesson.duration_sec / 60)}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 text-center font-mono text-sm font-semibold"
                aria-label="นาที"
              />
              <span className="font-bold text-muted-foreground">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={seconds}
                onChange={(e) =>
                  setSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))
                }
                className="w-20 text-center font-mono text-sm font-semibold"
                aria-label="วินาที"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1 pl-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPresetPercent(0.25)}
                className="h-8 text-xs"
              >
                25% ต้นคลิป
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPresetPercent(0.5)}
                className="h-8 text-xs"
              >
                50% กึ่งกลาง
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPresetPercent(0.75)}
                className="h-8 text-xs"
              >
                75% ท้ายคลิป
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Question */}
      <Field label="คำถามที่จะแสดง">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
          placeholder="เช่น สาระสำคัญของเนื้อหาในช่วงนี้คือข้อใด?"
          className="text-sm"
        />
      </Field>

      {/* Options */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            ตัวเลือกคำตอบ · คลิกปุ่มวงกลมเพื่อเลือกคำตอบที่ถูกต้อง
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {options.length} / 6 ตัวเลือก
          </span>
        </div>

        <div className="space-y-2">
          {options.map((opt, i) => {
            const isCorrect = correctIndex === i;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-2 transition-colors",
                  isCorrect
                    ? "border-emerald-500/50 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-950/20"
                    : "border-border bg-card",
                )}
              >
                <button
                  type="button"
                  onClick={() => setCorrectIndex(i)}
                  aria-label={`กำหนดให้ตัวเลือกที่ ${i + 1} เป็นคำตอบที่ถูกต้อง`}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-all",
                    isCorrect
                      ? "border-emerald-600 bg-emerald-600 text-white shadow-sm dark:bg-emerald-500"
                      : "border-muted-foreground/30 hover:border-primary text-muted-foreground",
                  )}
                >
                  {isCorrect ? "✓" : i + 1}
                </button>

                <Input
                  value={opt}
                  onChange={(e) => updateOptionText(i, e.target.value)}
                  required
                  placeholder={`พิมพ์ตัวเลือกที่ ${i + 1}...`}
                  className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-1"
                />

                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(i)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`ลบตัวเลือกที่ ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={options.length >= 6}
            onClick={addOption}
            className="text-xs h-8"
          >
            + เพิ่มตัวเลือก
          </Button>
          <p className="text-[11px] text-muted-foreground">
            คำตอบที่ถูกต้อง: <span className="font-semibold text-foreground">ตัวเลือกที่ {correctIndex + 1}</span>
          </p>
        </div>
      </div>

      {/* Live Preview Toggle */}
      <div className="pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview((p) => !p)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          {showPreview ? "ซ่อนตัวอย่างจำลอง" : "ดูตัวอย่างหน้าจอตอนวิดีโอหยุดถาม"}
        </Button>
      </div>

      {showPreview && (
        <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 transition-all">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <HelpCircle className="h-3.5 w-3.5" /> จำลองหน้าจอผู้เรียน (วิดีโอหยุดเล่นอัตโนมัติ)
            </span>
            <span className="text-[11px] text-muted-foreground font-mono">
              หยุดที่ {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </span>
          </div>

          <div className="rounded-lg border bg-background p-4 shadow-sm">
            <p className="font-medium text-foreground text-sm">
              {question || "คำถามจะแสดงผลตรงนี้..."}
            </p>

            <div className="mt-3 space-y-2">
              {options.map((opt, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-xs text-foreground/90 transition-colors"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 text-[10px]">
                    {String.fromCharCode(65 + i)}
                  </div>
                  <span>{opt || `ตัวเลือกที่ ${i + 1}`}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t pt-4">
        <div>
          {lesson.checkpoint_question && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={handleDelete}
              className="text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> ลบคำถามนี้
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onClose}
          >
            ยกเลิก
          </Button>
          <Button
            type="submit"
            size="sm"
            loading={busy}
            className="bg-primary text-primary-foreground font-medium"
          >
            บันทึกคำถาม
          </Button>
        </div>
      </div>
    </form>
  );
}

export function CheckpointEditorDialog({
  open,
  onOpenChange,
  lesson,
  onSave,
}: CheckpointEditorDialogProps) {
  if (!lesson) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="ตั้งค่าคำถามระหว่างเรียน (In-Video Checkpoint)"
      description="สร้างคำถามหยุดวิดีโออัตโนมัติ เพื่อกระตุ้นให้ผู้เรียนมีส่วนร่วมและทดสอบความเข้าใจระหว่างชมคลิป"
    >
      <CheckpointForm
        key={lesson.id}
        lesson={lesson}
        onSave={onSave}
        onClose={() => onOpenChange(false)}
      />
    </Dialog>
  );
}
