"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Alert, Button, Field, Input } from "@/components/ui";

export function CreateCourseForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await api<{ id: string }>("/api/instructor/courses", { body: { title: f.get("title"), description: f.get("description") || undefined } });
    setBusy(false);
    if (r.ok) router.push(`/instructor/courses/${r.data.id}`);
    else setError(r.message);
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="ชื่อหลักสูตร">
        <Input name="title" minLength={3} maxLength={255} required />
      </Field>
      <Field label="คำอธิบาย">
        <textarea name="description" rows={3} maxLength={10000} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
      </Field>
      <Button type="submit" disabled={busy}>
        สร้างหลักสูตร
      </Button>
    </form>
  );
}
