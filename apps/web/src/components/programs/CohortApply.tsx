"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LogIn, Send, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { Alert, AlertDialog, Button, Dialog, Field, Input, Textarea, buttonClass, confettiFrom, useToast } from "@/components/ui";

type Field = { key: string; label: string; type: "text" | "textarea"; required: boolean };

const RESULT: Record<string, { title: string; description: string }> = {
  approved: { title: "สมัครสำเร็จ", description: "คุณได้รับสิทธิ์เข้าอบรมแล้ว ระบบลงทะเบียนรายวิชาให้เรียบร้อย" },
  pending: { title: "ส่งใบสมัครแล้ว", description: "ใบสมัครอยู่ระหว่างรอผู้ดูแลพิจารณา ระบบจะแจ้งผลทางอีเมล" },
  waitlisted: { title: "อยู่ในรายชื่อสำรอง", description: "ที่นั่งเต็มแล้ว ระบบจะเลื่อนให้อัตโนมัติเมื่อมีที่ว่าง" },
};

/** Apply / withdraw button for one cohort, with the cohort's application form when it has one */
export function CohortApply({
  cohortId,
  loggedIn,
  canApply,
  canWithdraw,
  form,
  label = "สมัครเข้าอบรม",
}: {
  cohortId: string;
  loggedIn: boolean;
  canApply: boolean;
  canWithdraw: boolean;
  form: Field[];
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(answers: Record<string, string>, el?: HTMLElement | null) {
    setBusy(true);
    setError(null);
    const r = await api<{ status: string }>(`/api/cohorts/${cohortId}/apply`, { body: { answers } });
    setBusy(false);
    if (!r.ok) {
      if (open) setError(r.message);
      else toast({ title: "สมัครไม่สำเร็จ", description: r.message, variant: "destructive" });
      return;
    }
    setOpen(false);
    if (r.data.status === "approved" && el) confettiFrom(el, { count: 60 });
    const msg = RESULT[r.data.status] ?? RESULT.pending!;
    toast({ title: msg.title, description: msg.description, variant: "success" });
    router.refresh();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await submit(Object.fromEntries(form.map((x) => [x.key, String(f.get(x.key) ?? "")])), e.currentTarget.querySelector("button[type=submit]"));
  }

  async function withdraw() {
    setBusy(true);
    const r = await api(`/api/cohorts/${cohortId}/apply`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) {
      toast({ title: "ยกเลิกการสมัครแล้ว", variant: "success" });
      router.refresh();
    } else toast({ title: "ยกเลิกไม่สำเร็จ", description: r.message, variant: "destructive" });
  }

  if (!loggedIn && canApply) {
    return (
      <Link href="/login" className={buttonClass("default", "md", "w-full sm:w-auto")}>
        <LogIn className="h-4 w-4" /> เข้าสู่ระบบเพื่อสมัคร
      </Link>
    );
  }
  return (
    <>
      {canApply && (
        <Button
          loading={busy && !open}
          className="w-full sm:w-auto"
          onClick={(e) => (form.length ? setOpen(true) : void submit({}, e.currentTarget))}
        >
          <Send className="h-4 w-4" /> {label}
        </Button>
      )}
      {canWithdraw && (
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => setConfirmWithdraw(true)} disabled={busy}>
          <Undo2 className="h-4 w-4" /> ยกเลิกการสมัคร
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="ใบสมัครเข้าอบรม" description="กรอกข้อมูลตามที่หลักสูตรกำหนด">
        <form onSubmit={onSubmit} className="grid gap-4">
          {error && <Alert variant="destructive" title={error} />}
          {form.map((f) => (
            <Field key={f.key} label={f.required ? `${f.label} *` : f.label}>
              {f.type === "textarea" ? <Textarea name={f.key} rows={3} maxLength={2000} required={f.required} /> : <Input name={f.key} maxLength={2000} required={f.required} />}
            </Field>
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button type="submit" loading={busy}>ส่งใบสมัคร</Button>
          </div>
        </form>
      </Dialog>
      <AlertDialog
        open={confirmWithdraw}
        onOpenChange={setConfirmWithdraw}
        title="ยกเลิกการสมัครรอบนี้?"
        description="ที่นั่งของคุณจะถูกส่งต่อให้ผู้อยู่ในรายชื่อสำรอง หากได้รับอนุมัติแล้ว สิทธิ์เข้าเรียนรายวิชาในรอบนี้จะถูกยกเลิกด้วย"
        confirmLabel="ยกเลิกการสมัคร"
        cancelLabel="ไม่ยกเลิก"
        destructive
        onConfirm={() => void withdraw()}
      />
    </>
  );
}
