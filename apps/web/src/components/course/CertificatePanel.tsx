"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Award, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, AlertDialog, Button, Card, Checkbox, DownloadIcon, Field, Input, usePlay, useToast } from "@/components/ui";

export function LockLegalNameForm({ className }: { className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ th: string; en: string } | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const th = String(f.get("th") ?? "").trim();
    const en = String(f.get("en") ?? "").trim();
    if (!th && !en) return setError("กรอกชื่ออย่างน้อย 1 ภาษา");
    setError(null);
    setPending({ th, en });
  }

  async function lock() {
    if (!pending) return;
    setBusy(true);
    const r = await api("/api/user/lock-legal-name", {
      body: { ...(pending.th ? { legal_full_name_th: pending.th } : {}), ...(pending.en ? { legal_full_name_en: pending.en } : {}), confirm: true },
    });
    setBusy(false);
    if (r.ok) {
      toast({ title: "ล็อกชื่อสำหรับใบรับรองแล้ว", variant: "success" });
      router.refresh();
    } else setError(r.message);
  }

  return (
    <Card className={cn("p-6", className)}>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">ชื่อ-นามสกุลจริงสำหรับใบรับรอง</h2>
            <p className="text-sm text-muted-foreground">ชื่อนี้จะพิมพ์บนใบรับรองทุกใบ และแก้ไขไม่ได้อีกหลังยืนยัน</p>
          </div>
        </div>
        {error && <Alert variant="destructive" title={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อ-นามสกุล (ภาษาไทย)">
            <Input name="th" autoComplete="name" maxLength={120} placeholder="เช่น สมชาย ใจดี" />
          </Field>
          <Field label="Full name (English)">
            <Input name="en" autoComplete="name" maxLength={120} placeholder="e.g. Somchai Jaidee" />
          </Field>
        </div>
        <Checkbox name="confirm" required label="ข้าพเจ้ายืนยันว่าชื่อ-นามสกุลนี้ถูกต้อง และรับทราบว่าจะแก้ไขชื่อในใบรับรองไม่ได้อีก" />
        <Button type="submit" loading={busy} className="justify-self-start">
          <Lock className="h-4 w-4" /> ยืนยันและล็อกชื่อ
        </Button>
      </form>
      <AlertDialog
        open={!!pending}
        onOpenChange={(v) => !v && setPending(null)}
        title="ยืนยันการล็อกชื่อ"
        description={`ชื่อที่จะพิมพ์บนใบรับรอง: ${[pending?.th, pending?.en].filter(Boolean).join(" / ")} — หลังยืนยันจะแก้ไขไม่ได้อีก`}
        confirmLabel="ล็อกชื่อ"
        cancelLabel="แก้ไขก่อน"
        onConfirm={() => void lock()}
      />
    </Card>
  );
}

export function IssueCertificateButton({ courseId, nameTh, nameEn }: { courseId: string; nameTh: string | null; nameEn: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locale, setLocale] = useState<"th" | "en">(nameTh ? "th" : "en");
  const issue = async () => {
    setBusy(true);
    const r = await api(`/api/courses/${courseId}/certificate/issue`, { body: { locale } });
    setBusy(false);
    if (r.ok) router.refresh();
    else setError(r.message);
  };
  const choices = [
    ...(nameTh ? [{ value: "th" as const, label: "ภาษาไทย", name: nameTh }] : []),
    ...(nameEn ? [{ value: "en" as const, label: "English", name: nameEn }] : []),
  ];
  return (
    <Card className="grid gap-5 p-6">
      <div>
        <h2 className="font-semibold">ออกใบรับรอง</h2>
        <p className="text-sm text-muted-foreground">ออกได้ 1 ใบต่อหลักสูตร เลือกภาษาของชื่อที่จะพิมพ์บนใบรับรอง</p>
      </div>
      {error && <Alert variant="destructive" title={error} />}
      <div role="radiogroup" aria-label="ภาษาบนใบรับรอง" className="grid gap-3 sm:grid-cols-2">
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={locale === c.value}
            onClick={() => setLocale(c.value)}
            className={cn(
              "rounded-lg border p-4 text-left transition-[border-color,background-color,box-shadow] hover:bg-muted/50",
              locale === c.value && "border-primary bg-accent ring-1 ring-primary",
            )}
          >
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-medium">{c.name}</p>
          </button>
        ))}
      </div>
      <Button size="lg" loading={busy} onClick={issue} className="justify-self-start">
        <Award className="h-4 w-4" /> ออกใบรับรอง
      </Button>
    </Card>
  );
}

export function DownloadCertificateButton({ code, variant = "default", size = "md" }: { code: string; variant?: "default" | "outline"; size?: "sm" | "md" }) {
  const toast = useToast();
  const [play, replay] = usePlay();
  const [state, setState] = useState<"idle" | "working" | "rendering">("idle");
  async function download(attempt = 0): Promise<void> {
    setState("working");
    const res = await fetch(`/api/certificates/${code}/download`, { credentials: "same-origin", cache: "no-store" });
    if (res.status === 202) {
      setState("rendering");
      if (attempt < 12) {
        await new Promise((r) => setTimeout(r, 5000));
        return download(attempt + 1);
      }
    }
    if (!res.ok || res.status === 202) {
      setState("idle");
      toast({ title: "ดาวน์โหลดไม่สำเร็จ", description: "กรุณาลองใหม่ภายหลัง", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${code}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    replay();
    setState("idle");
  }
  return (
    <Button variant={variant} size={size} onClick={() => void download()} loading={state !== "idle"}>
      {state === "idle" && <DownloadIcon play={play} />}
      {state === "rendering" ? "กำลังสร้างไฟล์ PDF…" : "ดาวน์โหลด PDF"}
    </Button>
  );
}
