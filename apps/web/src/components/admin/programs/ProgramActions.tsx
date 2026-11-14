"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Archive, Eye, EyeOff, Globe, Plus, Save, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { Alert, AlertDialog, Badge, Button, Checkbox, Dialog, Field, Input, Select, Textarea, useToast } from "@/components/ui";

function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run<T>(path: string, init: { method?: string; body?: unknown }, done: string, after?: (data: T) => void) {
    setBusy(true);
    const r = await api<T>(path, init);
    setBusy(false);
    if (r.ok) {
      toast({ title: done, variant: "success" });
      if (after) after(r.data);
      else router.refresh();
      return true;
    }
    toast({ title: "ทำรายการไม่สำเร็จ", description: r.message, variant: "destructive" });
    return false;
  }
  return { busy, run, router };
}

export function CreateProgramDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await api<{ id: string }>("/api/admin/programs", {
      body: { title: f.get("title"), summary: String(f.get("summary") ?? "") || undefined, category: String(f.get("category") ?? "") || undefined },
    });
    setBusy(false);
    if (r.ok) router.push(`/admin/programs/${r.data.id}`);
    else setError(r.message);
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> สร้างหลักสูตรอบรม
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="สร้างหลักสูตรอบรม" description="เริ่มจากฉบับร่าง เลือกรายวิชา แล้วจึงเผยแพร่และเปิดรอบอบรม">
        <form onSubmit={onSubmit} className="grid gap-4">
          {error && <Alert variant="destructive" title={error} />}
          <Field label="ชื่อหลักสูตร"><Input name="title" minLength={3} maxLength={255} required placeholder="เช่น ครูแกนนำดิจิทัล รุ่นที่ 1" /></Field>
          <Field label="คำโปรย" hint="ข้อความสั้นที่แสดงบนการ์ดหลักสูตร"><Textarea name="summary" rows={2} maxLength={500} /></Field>
          <Field label="หมวดหมู่" hint="ไม่บังคับ"><Input name="category" maxLength={60} placeholder="เช่น เทคโนโลยีดิจิทัล" /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button type="submit" loading={busy}>สร้างและแก้ไขต่อ</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function ProgramInfoForm({ program }: { program: { id: string; title: string; summary: string | null; description: string | null; category: string | null } }) {
  const { busy, run } = useAction();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(`/api/admin/programs/${program.id}`, {
      method: "PATCH",
      body: { title: f.get("title"), summary: String(f.get("summary") ?? ""), description: String(f.get("description") ?? ""), category: String(f.get("category") ?? "") },
    }, "บันทึกข้อมูลหลักสูตรแล้ว");
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4 p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <Field label="ชื่อหลักสูตร"><Input name="title" defaultValue={program.title} minLength={3} maxLength={255} required /></Field>
        <Field label="หมวดหมู่"><Input name="category" defaultValue={program.category ?? ""} maxLength={60} /></Field>
      </div>
      <Field label="คำโปรย" hint="อย่างน้อย 10 ตัวอักษร ใช้บนการ์ดหลักสูตรและเมื่อแชร์ลิงก์"><Textarea name="summary" defaultValue={program.summary ?? ""} rows={2} maxLength={500} /></Field>
      <Field label="รายละเอียด" hint="รองรับหัวข้อ (## ข้อความ), รายการ (- ข้อความ), ย่อหน้า และลิงก์ https://">
        <Textarea name="description" defaultValue={program.description ?? ""} rows={10} maxLength={20000} />
      </Field>
      <div><Button type="submit" loading={busy}><Save className="h-4 w-4" /> บันทึก</Button></div>
    </form>
  );
}

type CourseOption = { id: string; title: string; visibility: string; instructor_name: string };
type Selected = { courseId: string; isRequired: boolean };

const VIS_TH: Record<string, string> = { draft: "ฉบับร่าง", published: "เผยแพร่", unlisted: "เฉพาะผู้มีลิงก์", suspended: "ถูกระงับ" };

export function ProgramCoursesEditor({ programId, initial, allCourses }: { programId: string; initial: Selected[]; allCourses: CourseOption[] }) {
  const { busy, run } = useAction();
  const [items, setItems] = useState<Selected[]>(initial);
  const [pick, setPick] = useState("");
  const byId = new Map(allCourses.map((c) => [c.id, c]));
  const available = allCourses.filter((c) => !items.some((i) => i.courseId === c.id));
  const dirty = JSON.stringify(items) !== JSON.stringify(initial);
  const move = (i: number, d: -1 | 1) => setItems((xs) => {
    const next = [...xs];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    return next;
  });
  return (
    <div className="grid gap-4 p-5">
      <p className="text-sm text-muted-foreground">
        เลือกรายวิชาและเรียงลำดับการเรียน ผู้ที่ได้รับอนุมัติจะถูกลงทะเบียนทุกรายวิชาในหลักสูตรโดยอัตโนมัติ
        แนะนำให้ตั้งรายวิชาเป็น “เฉพาะผู้มีลิงก์” เพื่อให้เข้าเรียนได้เฉพาะผู้ที่สมัครผ่านรอบอบรม
      </p>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">ยังไม่มีรายวิชา</p>
      ) : (
        <ol className="divide-y rounded-lg border">
          {items.map((it, i) => {
            const c = byId.get(it.courseId);
            return (
              <li key={it.courseId} className="flex flex-wrap items-center gap-3 p-3">
                <span className="w-6 text-center text-sm font-semibold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c?.title ?? "รายวิชาที่ไม่พบ"}</p>
                  <p className="text-xs text-muted-foreground">{c?.instructor_name} · {VIS_TH[c?.visibility ?? ""] ?? c?.visibility}</p>
                </div>
                <Checkbox
                  label="วิชาบังคับ"
                  checked={it.isRequired}
                  onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, isRequired: e.currentTarget.checked } : x)))}
                />
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น"><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="เลื่อนลง"><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label="นำออก"><X className="h-4 w-4" /></Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <Field label="เพิ่มรายวิชา">
            <Select value={pick} onValueChange={setPick} placeholder="เลือกรายวิชา…" options={available.map((c) => ({ value: c.id, label: c.title, description: `${c.instructor_name} · ${VIS_TH[c.visibility] ?? c.visibility}` }))} />
          </Field>
        </div>
        <Button variant="outline" disabled={!pick} onClick={() => { setItems((xs) => [...xs, { courseId: pick, isRequired: true }]); setPick(""); }}>
          <Plus className="h-4 w-4" /> เพิ่ม
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <Button loading={busy} disabled={!dirty} onClick={() => void run(`/api/admin/programs/${programId}/courses`, { method: "PUT", body: { courses: items } }, "บันทึกรายวิชาแล้ว")}>
          <Save className="h-4 w-4" /> บันทึกรายวิชา
        </Button>
        {dirty && <Badge variant="warning">ยังไม่ได้บันทึก</Badge>}
      </div>
    </div>
  );
}

export function ProgramPublishActions({ programId, visibility, problems }: { programId: string; visibility: string; problems: string[] }) {
  const { busy, run, router } = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (v: string, done: string) => void run(`/api/admin/programs/${programId}/publish`, { method: "PATCH", body: { visibility: v } }, done);
  return (
    <div className="grid gap-4 p-5">
      {problems.length > 0 ? (
        <Alert variant="warning" title="ยังเผยแพร่ไม่ได้">
          <ul className="list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </Alert>
      ) : (
        <Alert variant="success" title="ผ่านเกณฑ์การเผยแพร่" />
      )}
      <div className="flex flex-wrap gap-2">
        {visibility !== "published" && <Button loading={busy} disabled={problems.length > 0} onClick={() => set("published", "เผยแพร่หลักสูตรแล้ว")}><Globe className="h-4 w-4" /> เผยแพร่</Button>}
        {visibility !== "unlisted" && <Button variant="outline" loading={busy} disabled={problems.length > 0} onClick={() => set("unlisted", "ตั้งเป็นเฉพาะผู้มีลิงก์แล้ว")}><Eye className="h-4 w-4" /> เฉพาะผู้มีลิงก์</Button>}
        {visibility !== "draft" && <Button variant="outline" loading={busy} onClick={() => set("draft", "ถอยเป็นฉบับร่างแล้ว")}><EyeOff className="h-4 w-4" /> ถอยเป็นฉบับร่าง</Button>}
        {visibility !== "archived" && <Button variant="outline" loading={busy} onClick={() => set("archived", "เก็บเข้าคลังแล้ว")}><Archive className="h-4 w-4" /> เก็บเข้าคลัง</Button>}
        <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> ลบหลักสูตร</Button>
      </div>
      <AlertDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="ลบหลักสูตรนี้?"
        description="ลบได้เฉพาะหลักสูตรที่ยังไม่มีผู้สมัคร รอบอบรมทั้งหมดจะถูกลบไปด้วย รายวิชายังอยู่ครบ"
        confirmLabel="ลบ"
        cancelLabel="ยกเลิก"
        destructive
        onConfirm={() => void run(`/api/admin/programs/${programId}`, { method: "DELETE" }, "ลบหลักสูตรแล้ว", () => router.push("/admin/programs"))}
      />
    </div>
  );
}
