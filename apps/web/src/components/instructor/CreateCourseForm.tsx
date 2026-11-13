"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Alert, Button, Dialog, Field, Input, Textarea } from "@/components/ui";

/** "New course" button + dialog; creates a draft and opens its editor. */
export function CreateCourseDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await api<{ id: string }>("/api/instructor/courses", { body: { title: f.get("title"), description: f.get("description") || undefined } });
    setBusy(false);
    if (r.ok) router.push(`/instructor/courses/${r.data.id}`);
    else setError(r.message);
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> สร้างหลักสูตร
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="สร้างหลักสูตรใหม่" description="เริ่มจากฉบับร่าง เพิ่มบทเรียนและข้อสอบ แล้วจึงเผยแพร่">
        <form onSubmit={onSubmit} className="grid gap-4">
          {error && <Alert variant="destructive" title={error} />}
          <Field label="ชื่อหลักสูตร">
            <Input name="title" minLength={3} maxLength={255} required placeholder="เช่น พื้นฐาน Excel สำหรับการทำงาน" />
          </Field>
          <Field label="คำอธิบาย" hint="ไม่บังคับ แก้ไขภายหลังได้">
            <Textarea name="description" rows={3} maxLength={10000} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" loading={busy}>
              สร้างและแก้ไขต่อ
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
