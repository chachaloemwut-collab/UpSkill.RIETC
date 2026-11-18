"use client";
/**
 * Learning units (หน่วยการเรียนรู้) for the course editor: add / rename / write the unit summary article /
 * reorder / delete, plus the per-lesson details form (unit, source description, learner caution note).
 */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, BookOpenText, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { AlertDialog, Badge, Button, Card, EmptyState, Field, Input, Select, Textarea, Tooltip, useToast } from "@/components/ui";

export interface EditorUnit {
  id: string;
  sequence_order: number;
  title: string;
  summary: string | null;
}

interface LessonLite {
  id: string;
  sequence_order: number;
  title: string;
  duration_sec: number;
  unit_id: string | null;
  description: string | null;
  learner_note: string | null;
}

function useRun() {
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

export function UnitsManager({ base, units, lessons }: { base: string; units: EditorUnit[]; lessons: LessonLite[] }) {
  const a = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<EditorUnit | null>(null);

  const move = (idx: number, dir: -1 | 1) => {
    const ids = units.map((u) => u.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
    void a.run(`${base}/units/order`, { method: "PUT", body: { unit_ids: ids } });
  };

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await a.run(`${base}/units`, { body: { title: f.get("title"), summary: String(f.get("summary") ?? "") || null } }, "เพิ่มหน่วยการเรียนรู้แล้ว");
    if (ok) {
      form.reset();
      setAdding(false);
    }
  }

  async function onSave(e: FormEvent<HTMLFormElement>, unitId: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await a.run(`${base}/units/${unitId}`, { method: "PATCH", body: { title: f.get("title"), summary: String(f.get("summary") ?? "") || null } }, "บันทึกหน่วยการเรียนรู้แล้ว");
    if (ok) setEditing(null);
  }

  return (
    <Card className="shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Layers className="h-4 w-4 text-primary" /> หน่วยการเรียนรู้
          </h3>
          <p className="text-xs text-muted-foreground">จัดกลุ่มคลิปเป็นหน่วย พร้อมบทความสรุปประจำหน่วยให้ผู้เรียนอ่าน (ไม่บังคับ)</p>
        </div>
        <Button size="sm" variant={adding ? "ghost" : "outline"} onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> เพิ่มหน่วย
        </Button>
      </div>

      {adding && (
        <form onSubmit={onAdd} className="grid gap-3 border-b bg-muted/30 p-4 animate-slide-up">
          <Field label="ชื่อหน่วย">
            <Input name="title" required maxLength={255} placeholder="เช่น พื้นฐานการเตรียมโครงสร้าง" />
          </Field>
          <Field label="บทความสรุปประจำหน่วย" hint="ขึ้นบรรทัดใหม่ได้ตามต้องการ ผู้เรียนเปิดอ่านได้จากหน้าหลักสูตรและหน้าคลิป">
            <Textarea name="summary" rows={6} maxLength={20000} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={a.busy}>บันทึกหน่วย</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>ยกเลิก</Button>
          </div>
        </form>
      )}

      {units.length === 0 ? (
        !adding && (
          <div className="p-6">
            <EmptyState icon={<Layers className="h-6 w-6 text-primary" />} title="ยังไม่ได้แบ่งหน่วย" description="หลักสูตรที่ไม่แบ่งหน่วยจะแสดงคลิปเรียงต่อกันตามปกติ" />
          </div>
        )
      ) : (
        <ol className="divide-y">
          {units.map((u, i) => {
            const members = lessons.filter((l) => l.unit_id === u.id);
            return (
              <li key={u.id} className="grid gap-3 px-4 py-3.5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="flex h-7 shrink-0 items-center justify-center rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary">หน่วยที่ {i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{u.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {members.length} คลิป · {formatDuration(members.reduce((n, l) => n + l.duration_sec, 0))}
                      {u.summary ? " · มีบทความสรุป" : " · ยังไม่มีบทความสรุป"}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Tooltip content="เลื่อนขึ้น">
                      <Button variant="ghost" size="icon" disabled={a.busy || i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนหน่วยขึ้น">
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="เลื่อนลง">
                      <Button variant="ghost" size="icon" disabled={a.busy || i === units.length - 1} onClick={() => move(i, 1)} aria-label="เลื่อนหน่วยลง">
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="แก้ไขชื่อและบทความสรุป">
                      <Button variant={editing === u.id ? "secondary" : "ghost"} size="icon" onClick={() => setEditing(editing === u.id ? null : u.id)} aria-label="แก้ไขหน่วย">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="ลบหน่วย (คลิปยังอยู่)">
                      <Button variant="ghost" size="icon" disabled={a.busy} onClick={() => setDeleting(u)} aria-label="ลบหน่วย" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </div>
                {editing === u.id && (
                  <form onSubmit={(e) => void onSave(e, u.id)} className="grid gap-3 rounded-lg bg-muted/40 p-3 animate-slide-up">
                    <Field label="ชื่อหน่วย">
                      <Input name="title" required maxLength={255} defaultValue={u.title} className="bg-background" />
                    </Field>
                    <Field label="บทความสรุปประจำหน่วย">
                      <Textarea name="summary" rows={8} maxLength={20000} defaultValue={u.summary ?? ""} className="bg-background" />
                    </Field>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" loading={a.busy}>บันทึก</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>ยกเลิก</Button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`ลบหน่วย "${deleting?.title ?? ""}"?`}
        description="คลิปในหน่วยนี้ยังอยู่ครบ เพียงไม่ได้ถูกจัดอยู่ในหน่วยใด"
        confirmLabel="ลบหน่วย"
        destructive
        onConfirm={async () => {
          if (deleting) await a.run(`${base}/units/${deleting.id}`, { method: "DELETE" }, "ลบหน่วยแล้ว");
          setDeleting(null);
        }}
      />
    </Card>
  );
}

/** Per-lesson details: which unit it belongs to, a description/source credit, and a caution note for learners. */
export function LessonDetailsForm({ base, lesson, units, onDone }: { base: string; lesson: LessonLite; units: EditorUnit[]; onDone: () => void }) {
  const a = useRun();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") ?? "").trim();
    const ok = await a.run(
      `${base}/lessons/${lesson.id}`,
      {
        method: "PATCH",
        body: {
          ...(title && title !== lesson.title ? { title } : {}),
          unit_id: String(f.get("unit_id") ?? "") || null,
          description: String(f.get("description") ?? "") || null,
          learner_note: String(f.get("learner_note") ?? "") || null,
        },
      },
      "บันทึกรายละเอียดคลิปแล้ว",
    );
    if (ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg bg-muted/40 p-3 animate-slide-up">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ชื่อคลิป">
          <Input name="title" defaultValue={lesson.title} maxLength={255} className="bg-background" />
        </Field>
        <Field label="หน่วยการเรียนรู้">
          <Select name="unit_id" defaultValue={lesson.unit_id ?? ""} className="bg-background">
            <option value="">— ไม่อยู่ในหน่วยใด —</option>
            {units.map((u, i) => (
              <option key={u.id} value={u.id}>
                หน่วยที่ {i + 1}: {u.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="คำอธิบาย / แหล่งที่มาของคลิป" hint="เช่น ช่องผู้ผลิต จุดเชื่อมโยงกับคลิปอื่น">
        <Textarea name="description" rows={2} maxLength={5000} defaultValue={lesson.description ?? ""} className="bg-background" />
      </Field>
      <Field label="ข้อควรระวังสำหรับผู้เรียน" hint="แสดงเป็นกล่องเตือนเหนือคลิป เช่น สิ่งที่ในคลิปทำแต่กติกาไม่อนุญาต">
        <Textarea name="learner_note" rows={2} maxLength={2000} defaultValue={lesson.learner_note ?? ""} className="bg-background" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={a.busy}>บันทึก</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>ยกเลิก</Button>
      </div>
    </form>
  );
}

export function UnitBadge({ unit, index }: { unit: EditorUnit | undefined; index: number }) {
  if (!unit) return null;
  return (
    <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
      <BookOpenText className="h-3 w-3" /> หน่วยที่ {index + 1}
    </Badge>
  );
}
