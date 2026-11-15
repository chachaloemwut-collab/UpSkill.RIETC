"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Award, Check, Copy, ExternalLink, Lock, Maximize2, Printer, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, AlertDialog, Badge, Button, Card, Checkbox, Dialog, DownloadIcon, Field, Input, usePlay, useToast } from "@/components/ui";
import { formatDateTh } from "@/lib/format";
import { BRAND_NAME } from "@/components/brand/BrandLogo";

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
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="ชื่อ-นามสกุล (ภาษาไทย)">
            <Input name="th" autoComplete="name" maxLength={120} placeholder="เช่น นายสมชาย ใจดี" defaultValue={defaultTh ?? ""} />
          </Field>
          <Field label="Full name (English)">
            <Input name="en" autoComplete="name" maxLength={120} placeholder="e.g. Mr. Somchai Jaidee" defaultValue={defaultEn ?? ""} />
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

export function CertificateViewerCard({
  code,
  courseTitle,
  recipientName,
  issuedAt,
  revokedAt,
  credentialName,
}: {
  code: string;
  courseTitle: string;
  recipientName: string;
  issuedAt?: string;
  revokedAt?: string | null;
  credentialName?: string;
}) {
  const toast = useToast();
  const [zoomOpen, setZoomOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/verify/${code}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "คัดลอกลิงก์ตรวจสอบแล้ว", variant: "success" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
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
            <h3 className="text-xl font-bold tracking-tight text-foreground">{credentialName || "ใบประกาศนียบัตรสำเร็จการศึกษา"}</h3>
            <p className="text-sm text-muted-foreground">{courseTitle}</p>
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-4 py-1.5 backdrop-blur-xs">
            <span className="text-xs text-muted-foreground">รหัสใบรับรอง:</span>
            <span className="font-mono text-sm font-semibold tracking-wider text-primary">{code}</span>
          </div>
        </div>

        {/* Certificate Details & Actions */}
        <div className="grid gap-4 p-6">
          {revokedAt ? (
            <Alert variant="destructive" title="ใบรับรองนี้ถูกเพิกถอนแล้ว" />
          ) : (
            <Alert variant="success" title="ออกใบรับรองเรียบร้อยแล้ว">
              ใบรับรองนี้ลงนามด้วยระบบ Ed25519 ดิจิทัล สามารถใช้สมัครงานหรือเทียบโอนหน่วยกิตได้
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

            <Button variant="outline" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" /> พิมพ์เอกสาร
            </Button>

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
        title="ตัวอย่างใบรับรอง (Certificate Preview)"
        className="max-w-4xl"
      >
        <div className="p-2 sm:p-4">
          <div className="relative aspect-[1.414/1] w-full rounded-xl border-8 border-amber-600/20 bg-background p-6 sm:p-10 shadow-inner flex flex-col justify-between text-center select-none overflow-hidden">
            {/* Corner Filigree Ornaments */}
            <div className="absolute top-2 left-2 w-8 h-8 border-t-2 border-l-2 border-amber-600/40" />
            <div className="absolute top-2 right-2 w-8 h-8 border-t-2 border-r-2 border-amber-600/40" />
            <div className="absolute bottom-2 left-2 w-8 h-8 border-b-2 border-l-2 border-amber-600/40" />
            <div className="absolute bottom-2 right-2 w-8 h-8 border-b-2 border-r-2 border-amber-600/40" />

            <div>
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                Regional Institute of Vocational Education North Eastern Region 1
              </p>
              <h2 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground mt-2">
                {credentialName || "ใบประกาศนียบัตรรับรองสมรรถนะ"}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">CERTIFICATE OF ACHIEVEMENT</p>
            </div>

            <div className="my-auto py-4">
              <p className="text-xs text-muted-foreground">เอกสารฉบับนี้รับรองว่า</p>
              <h3 className="text-lg sm:text-2xl font-bold text-primary mt-1 tracking-wide">
                {recipientName}
              </h3>
              <p className="text-xs text-muted-foreground mt-3">ได้ผ่านการอบรมและทดสอบตามเกณฑ์มาตรฐานในหลักสูตร</p>
              <p className="text-sm sm:text-lg font-semibold text-foreground mt-1">
                {courseTitle}
              </p>
            </div>

            <div className="flex items-end justify-between border-t border-border/80 pt-4 text-left">
              <div>
                <p className="text-[10px] text-muted-foreground">ออกให้ ณ วันที่</p>
                <p className="text-xs font-medium text-foreground">{issuedAt ? formatDateTh(issuedAt, "long") : "—"}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">รหัส: {code}</p>
              </div>

              <div className="flex flex-col items-center">
                <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full border-2 border-emerald-500/80 bg-emerald-500/10 text-emerald-600">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <span className="font-mono text-[8px] font-bold text-emerald-600 tracking-wider mt-1">
                  ED25519 VERIFIED
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-3.5 w-3.5" /> พิมพ์ (A4 Landscape)
            </Button>
            <Button size="sm" onClick={() => setZoomOpen(false)}>
              ปิด
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Hidden Print Container formatted strictly for A4 Landscape */}
      <div className="hidden print:block certificate-print-container">
        <div className="relative h-full w-full border-[10px] border-black p-10 flex flex-col justify-between text-center">
          <div>
            <p className="text-xs tracking-widest uppercase font-semibold text-neutral-600">
              สถาบันการอาชีวศึกษาภาคตะวันออกเฉียงเหนือ 1 ({BRAND_NAME})
            </p>
            <h1 className="text-3xl font-bold mt-4 tracking-tight">
              {credentialName || "ใบประกาศนียบัตรรับรองสมรรถนะ"}
            </h1>
            <p className="text-sm text-neutral-500 uppercase tracking-widest mt-1">CERTIFICATE OF ACHIEVEMENT</p>
          </div>

          <div className="my-auto py-8">
            <p className="text-sm text-neutral-600">เอกสารฉบับนี้รับรองว่า</p>
            <h2 className="text-3xl font-bold mt-2">{recipientName}</h2>
            <p className="text-sm text-neutral-600 mt-4">ได้สำเร็จการศึกษาตามเกณฑ์มาตรฐานในหลักสูตร</p>
            <h3 className="text-xl font-semibold mt-1">{courseTitle}</h3>
          </div>

          <div className="flex items-end justify-between border-t-2 border-neutral-300 pt-6 text-left">
            <div>
              <p className="text-xs text-neutral-500">วันที่ออกเอกสาร</p>
              <p className="text-sm font-semibold">{issuedAt ? formatDateTh(issuedAt, "long") : "—"}</p>
              <p className="text-xs font-mono text-neutral-500 mt-1">รหัสเอกสาร: {code}</p>
            </div>
            <div className="text-center">
              <div className="inline-block border-2 border-neutral-800 px-4 py-2 text-xs font-mono font-bold tracking-wider uppercase">
                ED25519 SIGNED & VERIFIED
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
