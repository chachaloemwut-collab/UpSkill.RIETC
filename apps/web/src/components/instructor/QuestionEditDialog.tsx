"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, Plus, Trash2, HelpCircle } from "lucide-react";
import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  Badge,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/utils";

export interface QuestionData {
  id: string;
  question_text: string;
  assessment_type: "pre" | "lesson" | "post";
  lesson_id: string | null;
  options: Array<{ id: string; text: string }>;
  correct_option_id: string;
}

export interface QuestionEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: QuestionData | null;
  lessons: Array<{ id: string; sequence_order: number; title: string }>;
  onSave: (
    questionId: string,
    data: {
      question_text: string;
      options: string[];
      correct_index: number;
      assessment_type: "pre" | "lesson" | "post";
      lesson_id?: string | null;
    },
  ) => Promise<boolean>;
}

function QuestionEditForm({
  question,
  lessons,
  onSave,
  onClose,
}: {
  question: QuestionData;
  lessons: Array<{ id: string; sequence_order: number; title: string }>;
  onSave: QuestionEditDialogProps["onSave"];
  onClose: () => void;
}) {
  const toast = useToast();
  const [assessmentType, setAssessmentType] = useState<"pre" | "lesson" | "post">(
    question.assessment_type,
  );
  const [lessonId, setLessonId] = useState<string>(question.lesson_id ?? "");
  const [questionText, setQuestionText] = useState(question.question_text);

  const initialOptions = question.options.map((o) => o.text);
  const [options, setOptions] = useState<string[]>(
    initialOptions.length >= 2 ? initialOptions : ["", ""],
  );

  const initialCorrect = question.options.findIndex((o) => o.id === question.correct_option_id);
  const [correctIndex, setCorrectIndex] = useState(initialCorrect >= 0 ? initialCorrect : 0);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

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
    if (questionText.trim().length < 3) {
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
        description: "กรุณากรอกข้อความให้ครบทุกตัวเลือก",
      });
      return;
    }

    if (assessmentType === "lesson" && !lessonId) {
      toast({
        variant: "destructive",
        title: "ยังไม่ได้เลือกบทเรียน",
        description: "แบบทดสอบระหว่างเรียนต้องผูกกับบทเรียนอย่างน้อย 1 บท",
      });
      return;
    }

    setBusy(true);
    try {
      const ok = await onSave(question.id, {
        question_text: questionText.trim(),
        options: cleanedOptions,
        correct_index: correctIndex,
        assessment_type: assessmentType,
        lesson_id: assessmentType === "lesson" ? lessonId : null,
      });

      if (ok) {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const selectedLesson = lessons.find((l) => l.id === lessonId);

  return (
    <form id="question-edit-form" onSubmit={handleSubmit} className="space-y-4 py-1">
      {/* Assessment Type & Lesson Linkage */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ช่วงการประเมิน (Assessment Type)">
          <Select
            value={assessmentType}
            onChange={(e) => setAssessmentType(e.target.value as "pre" | "lesson" | "post")}
          >
            <option value="pre">Pre-test ก่อนเริ่มเรียน</option>
            <option value="lesson">แบบทดสอบระหว่างอบรม</option>
            <option value="post">Post-test ท้ายหลักสูตร</option>
          </Select>
        </Field>

        {assessmentType === "lesson" ? (
          <Field label="ผูกกับบทเรียน">
            <Select
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              required
            >
              <option value="">เลือกบทเรียนที่ต้องการผูก</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  บทที่ {lesson.sequence_order}: {lesson.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="flex flex-col justify-end pb-1 text-xs text-muted-foreground">
            {assessmentType === "pre" ? (
              <p>ข้อสอบนี้จะปรากฏในแบบทดสอบก่อนเรียน เพื่อวัดพื้นฐานความรู้เดิม</p>
            ) : (
              <p>ข้อสอบนี้จะสุ่มขึ้นมาในแบบทดสอบวัดผลสัมฤทธิ์ก่อนออกวุฒิบัตร</p>
            )}
          </div>
        )}
      </div>

      {/* Question Text */}
      <Field label="โจทย์คำถาม">
        <Textarea
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          required
          rows={3}
          placeholder="พิมพ์ข้อความคำถามที่ต้องการถามผู้เรียน..."
          className="text-sm leading-relaxed"
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
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all",
                    isCorrect
                      ? "border-emerald-600 bg-emerald-600 text-white shadow-sm dark:bg-emerald-500"
                      : "border-muted-foreground/30 hover:border-primary text-muted-foreground",
                  )}
                >
                  {isCorrect ? (
                    <Check className="h-4 w-4 stroke-[2.5]" />
                  ) : (
                    <span className="text-xs font-medium tabular-nums">{i + 1}</span>
                  )}
                </button>

                <Input
                  value={opt}
                  onChange={(e) => updateOptionText(i, e.target.value)}
                  required
                  placeholder={`พิมพ์ข้อความตัวเลือกที่ ${i + 1}...`}
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
            <Plus className="mr-1 h-3.5 w-3.5" /> เพิ่มตัวเลือก
          </Button>
          <p className="text-[11px] text-muted-foreground">
            คำตอบที่ถูกต้อง: <span className="font-semibold text-foreground">ตัวเลือกที่ {correctIndex + 1}</span>
          </p>
        </div>
      </div>

      {/* Live Preview Drawer */}
      {showPreview && (
        <div className="rounded-xl border border-dashed border-primary/40 bg-muted/30 p-4 transition-all">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <HelpCircle className="h-3.5 w-3.5" /> ตัวอย่างที่ผู้เรียนจะเห็นในหน้าจอสอบ
            </span>
            <Badge variant={assessmentType === "post" ? "default" : assessmentType === "pre" ? "secondary" : "warning"}>
              {assessmentType === "pre" ? "Pre-test" : assessmentType === "post" ? "Post-test" : `บทเรียน: ${selectedLesson?.title ?? "บทเรียน"}`}
            </Badge>
          </div>

          <div className="rounded-lg border bg-background p-4 shadow-sm">
            <p className="font-medium text-foreground text-sm">
              {questionText || "คำถามจะแสดงผลตรงนี้..."}
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

      {/* Footer Buttons */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview((p) => !p)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {showPreview ? (
            <>
              <EyeOff className="mr-1.5 h-3.5 w-3.5" /> ซ่อนพรีวิว
            </>
          ) : (
            <>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> ตัวอย่างมุมมองผู้เรียน
            </>
          )}
        </Button>

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
            บันทึกการแก้ไข
          </Button>
        </div>
      </div>
    </form>
  );
}

export function QuestionEditDialog({
  open,
  onOpenChange,
  question,
  lessons,
  onSave,
}: QuestionEditDialogProps) {
  if (!question) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="แก้ไขข้อสอบ"
      description="ปรับปรุงข้อความ คำตอบที่ถูกต้อง และช่วงการวัดผลของข้อสอบข้อนี้"
    >
      <QuestionEditForm
        key={question.id}
        question={question}
        lessons={lessons}
        onSave={onSave}
        onClose={() => onOpenChange(false)}
      />
    </Dialog>
  );
}
