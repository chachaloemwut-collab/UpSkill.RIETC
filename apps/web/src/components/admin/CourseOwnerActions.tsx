"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Plus, UserCog } from "lucide-react";
import { api } from "@/lib/api";
import { COURSE_TYPES, COURSE_TYPE_INFO } from "@upskill/core/application";
import { Alert, Button, Dialog, Field, Input, Select, Textarea, useToast } from "@/components/ui";

export type InstructorOption = { id: string; email: string; name: string; role: string };

const options = (xs: InstructorOption[]) => xs.map((i) => ({ value: i.id, label: i.name, description: `${i.email}${i.role === "admin" ? " · ผู้ดูแล" : ""}`, keywords: [i.email] }));

/** Admin creates a course and assigns its instructor at the same time */
export function AdminCreateCourseDialog({ instructors, selfId }: { instructors: InstructorOption[]; selfId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState(selfId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await api<{ id: string }>("/api/admin/courses", { body: { title: f.get("title"), description: String(f.get("description") ?? "") || undefined, instructor_id: owner, course_type: f.get("course_type") || undefined } });
    setBusy(false);
    if (r.ok) router.push(`/instructor/courses/${r.data.id}`);
    else setError(r.message);
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> สร้างรายวิชา</Button>
      <Dialog open={open} onOpenChange={setOpen} title="สร้างรายวิชา" description="สร้างเป็นฉบับร่างและกำหนดผู้สอน จากนั้นเพิ่มบทเรียนและข้อสอบได้ทันที">
        <form onSubmit={onSubmit} className="grid gap-4">
          {error && <Alert variant="destructive" title={error} />}
          <Field label="ชื่อรายวิชา"><Input name="title" minLength={3} maxLength={255} required /></Field>
          <Field label="ผู้สอน" hint="ผู้สอนจะเห็นและแก้ไขรายวิชานี้ได้ และลงทะเบียนเรียนรายวิชานี้ไม่ได้">
            <Select value={owner} onValueChange={setOwner} options={options(instructors)} />
          </Field>
          <Field label="ประเภทหลักสูตร">
            <Select name="course_type" defaultValue="certified_training">
              {COURSE_TYPES.map((t) => (
                <option key={t} value={t}>{COURSE_TYPE_INFO[t].label} — ได้รับ{COURSE_TYPE_INFO[t].short}</option>
              ))}
            </Select>
          </Field>
          <Field label="คำอธิบาย" hint="ไม่บังคับ"><Textarea name="description" rows={3} maxLength={10000} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button type="submit" loading={busy}>สร้างและแก้ไขต่อ</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function ReassignInstructorDialog({ courseId, title, currentId, instructors, open, onOpenChange }: {
  courseId: string;
  title: string;
  currentId: string;
  instructors: InstructorOption[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [owner, setOwner] = useState(currentId);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await api(`/api/admin/courses/${courseId}`, { method: "PATCH", body: { instructor_id: owner } });
    setBusy(false);
    if (r.ok) {
      toast({ title: "เปลี่ยนผู้สอนแล้ว", variant: "success" });
      onOpenChange(false);
      router.refresh();
    } else toast({ title: "เปลี่ยนผู้สอนไม่สำเร็จ", description: r.message, variant: "destructive" });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="เปลี่ยนผู้สอน" description={`“${title}” · ชื่อผู้สอนใหม่จะใช้ในวุฒิบัตรที่ออกหลังจากนี้ (หากไม่ได้กำหนดผู้ลงนามไว้)`}>
      <div className="grid gap-4">
        <Field label="ผู้สอน"><Select value={owner} onValueChange={setOwner} options={options(instructors)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button loading={busy} disabled={owner === currentId} onClick={() => void save()}><UserCog className="h-4 w-4" /> บันทึก</Button>
        </div>
      </div>
    </Dialog>
  );
}
