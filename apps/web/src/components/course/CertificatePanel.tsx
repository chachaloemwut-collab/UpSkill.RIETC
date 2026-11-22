"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Award, Check, Copy, ExternalLink, Lock, Maximize2, Printer, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, AlertDialog, Badge, Button, Card, Checkbox, Dialog, DownloadIcon, Field, Input, usePlay, useToast } from "@/components/ui";
import { CertificatePreview } from "@/components/certificate/CertificatePreview";

export function LockLegalNameForm({ className, defaultTh, defaultEn }: { className?: string; defaultTh?: string | null; defaultEn?: string | null }) {
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
      toast({ title: "ล็อกชื่อสำหรับวุฒิบัตรแล้ว", variant: "success" });
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
            <h2 className="font-semibold">ชื่อ-นามสกุลจริงสำหรับวุฒิบัตร</h2>
            <p className="text-sm text-muted-foreground">ชื่อนี้จะพิมพ์บนวุฒิบัตรทุกใบ และแก้ไขไม่ได้อีกหลังยืนยัน</p>
          </div>
        </div>
        {error && <Alert variant="destructive" title={error} />}
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="ชื่อ-นามสกุล (ภาษาไทย)">
            <Input name="th" autoComplete="name" maxLength={120} placeholder="เช่น นายสมชาย ใจดี" defaultValue={defaultTh ?? ""} />
          </Field>
          <Field label="Full name (English)">
            <Input name="en" autoComplete="name" maxLength={120} placeholder="e.g. Mr. Somchai Jaidee" defaultValue={defaultEn ?? ""} />
          </Field>
        </div>
        <Checkbox name="confirm" required label="ข้าพเจ้ายืนยันว่าชื่อ-นามสกุลนี้ถูกต้อง และรับทราบว่าจะแก้ไขชื่อในวุฒิบัตรไม่ได้อีก" />
        <Button type="submit" loading={busy} loadingState="saving" className="justify-self-start">
          <Lock className="h-4 w-4" /> ยืนยันและล็อกชื่อ
        </Button>
      </form>
      <AlertDialog
        open={!!pending}
        onOpenChange={(v) => !v && setPending(null)}
        title="ยืนยันการล็อกชื่อ"
        description={`ชื่อที่จะพิมพ์บนวุฒิบัตร: ${[pending?.th, pending?.en].filter(Boolean).join(" / ")} — หลังยืนยันจะแก้ไขไม่ได้อีก`}
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
        <h2 className="font-semibold">ออกวุฒิบัตร</h2>
        <p className="text-sm text-muted-foreground">ออกได้ 1 ใบต่อหลักสูตร เลือกภาษาของชื่อที่จะพิมพ์บนวุฒิบัตร</p>
      </div>
      {error && <Alert variant="destructive" title={error} />}
      <div role="radiogroup" aria-label="ภาษาบนวุฒิบัตร" className="grid gap-3 sm:grid-cols-2">
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
      <Button size="lg" loading={busy} loadingState="saving" onClick={issue} className="justify-self-start">
        <Award className="h-4 w-4" /> ออกวุฒิบัตร
      </Button>
    </Card>
  );
}

/** `compact` = icon-only (tables), with the label kept as the accessible name/tooltip. */
export function DownloadCertificateButton({ code, variant = "default", size = "md", compact = false, print = false }: { print?: boolean; code: string; variant?: "default" | "outline"; size?: "sm" | "md"; compact?: boolean }) {
  const toast = useToast();
  const [play, replay] = usePlay();
  const [state, setState] = useState<"idle" | "working" | "rendering">("idle");
  async function download() {
    const viewer = print ? window.open("about:blank", "_blank") : null;
    if (print && !viewer) {
      toast({ title: "โปรดอนุญาตให้เปิดหน้าต่างเอกสาร", variant: "destructive" });
      return;
    }
    if (viewer) { viewer.opener = null; viewer.document.title = "กำลังเตรียมวุฒิบัตร"; viewer.document.body.textContent = "กำลังเตรียมไฟล์สำหรับพิมพ์…"; }
    setState("working");
    try {
      for (let attempt = 0; attempt <= 12; attempt++) {
        const res = await fetch(`/api/certificates/${code}/download`, { credentials: "same-origin", cache: "no-store" });
        if (res.status === 202) {
          setState("rendering");
          if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        if (!res.ok || !res.headers.get("content-type")?.startsWith("application/pdf")) break;
        const url = URL.createObjectURL(await res.blob());
        if (viewer) {
          viewer.location.replace(url);
          setTimeout(() => URL.revokeObjectURL(url), 120_000);
          return;
        }
        const link = document.createElement("a");
        link.href = url;
        link.download = `${code}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
        replay();
        toast({ brandState: "pdf-ready", title: "ไฟล์ PDF พร้อมดาวน์โหลดแล้ว", variant: "success" });
        return;
      }
    } catch {
      // Network and file-read failures share the retry message below.
    } finally {
      setState("idle");
    }
    viewer?.close();
    toast({ title: "ดาวน์โหลดไม่สำเร็จ", description: "กรุณาลองใหม่ภายหลัง", variant: "destructive" });
  }
  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => void download()}
      loading={state !== "idle"}
      loadingState={state === "rendering" ? "pdf-generating" : "page-loading"}
      {...(compact ? { "aria-label": state === "rendering" ? "กำลังสร้างไฟล์ PDF" : "ดาวน์โหลด PDF", title: "ดาวน์โหลด PDF", className: "h-8 px-2" } : {})}
    >
      {state === "idle" && (print ? <Printer className="h-4 w-4" /> : <DownloadIcon play={play} />)}
      {!compact && (state === "rendering" ? "กำลังสร้างไฟล์ PDF…" : print ? "เปิด PDF สำหรับพิมพ์" : "ดาวน์โหลด PDF")}
    </Button>
  );
}

export function CertificateViewerCard({
  code,
  courseTitle,
  revokedAt,
  credentialName,
  preview,
}: {
  code: string;
  courseTitle: string;
  revokedAt?: string | null;
  credentialName?: string;
  /** The issued document's snapshot, rendered with the same artwork as the PDF */
  preview: React.ComponentProps<typeof CertificatePreview>;
}) {
  const toast = useToast();
  const [zoomOpen, setZoomOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/verify/${code}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        toast({ title: "คัดลอกไม่สำเร็จ", variant: "destructive" });
        return;
      }
      setCopied(true);
      toast({ brandState: "sharing", title: "คัดลอกลิงก์ตรวจสอบแล้ว", variant: "success" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <Card className="overflow-hidden shadow-md no-print border-border/80">
        {/* Certificate Mini Banner */}
        <div className="relative flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-primary/15 via-muted/60 to-background px-6 py-10 text-center border-b">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20">
            <Award className="h-8 w-8" />
          </span>
          <div className="space-y-1">
            <Badge variant="success" className="gap-1 font-semibold text-xs">
              <Sparkles className="h-3 w-3" /> เอกสารผ่านการรับรองดิจิทัล
            </Badge>
            <h3 className="text-xl font-bold tracking-tight text-foreground">{credentialName || "วุฒิบัตร"}</h3>
            <p className="text-sm text-muted-foreground">{courseTitle}</p>
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-4 py-1.5 backdrop-blur-xs">
            <span className="text-xs text-muted-foreground">รหัสวุฒิบัตร:</span>
            <span className="font-mono text-sm font-semibold tracking-wider text-primary">{code}</span>
          </div>
        </div>

        {/* Certificate Details & Actions */}
        <div className="grid gap-4 p-6">
          {revokedAt ? (
            <Alert variant="destructive" title="วุฒิบัตรนี้ถูกเพิกถอนแล้ว" />
          ) : (
            <Alert variant="success" title="ออกวุฒิบัตรเรียบร้อยแล้ว">
              ตรวจสอบข้อมูลการรับรองและสถานะล่าสุดได้จากรหัสเอกสารหรือ QR Code บนไฟล์ PDF
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            {!revokedAt && <DownloadCertificateButton code={code} />}

            <Button variant="outline" onClick={() => setZoomOpen(true)} className="gap-1.5">
              <Maximize2 className="h-4 w-4" /> ดูแบบขยาย (Zoom)
            </Button>

            <Button variant="outline" onClick={copyLink} className="gap-1.5">
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              {copied ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์"}
            </Button>

            {!revokedAt && <DownloadCertificateButton code={code} variant="outline" print />}

            <Link href={`/verify/${code}`} className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              หน้าตรวจสอบสาธารณะ <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </Card>

      {/* Fullscreen Certificate Zoom Modal */}
      <Dialog
        open={zoomOpen}
        onOpenChange={setZoomOpen}
        title={credentialName || "วุฒิบัตร"}
        className="max-w-4xl"
      >
        <div className="p-2 sm:p-4">
          <CertificatePreview {...preview} />
          <div className="mt-4 flex justify-end gap-2">
            {!revokedAt && <DownloadCertificateButton code={code} variant="outline" size="sm" print />}
            <Button size="sm" onClick={() => setZoomOpen(false)}>
              ปิด
            </Button>
          </div>
        </div>
      </Dialog>

    </>
  );
}
