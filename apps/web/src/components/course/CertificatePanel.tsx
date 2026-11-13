"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export function LockLegalNameForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const th = String(f.get("th") ?? "").trim();
    const en = String(f.get("en") ?? "").trim();
    setBusy(true);
    const r = await api("/api/user/lock-legal-name", {
      body: { ...(th ? { legal_full_name_th: th } : {}), ...(en ? { legal_full_name_en: en } : {}), confirm: f.get("confirm") === "on" },
    });
    setBusy(false);
    if (r.ok) router.refresh();
    else setError(r.message);
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <h2 className="font-semibold">ยืนยันชื่อ-นามสกุลจริงสำหรับใบรับรอง</h2>
        <Alert tone="warning">ชื่อนี้จะถูกพิมพ์บนใบรับรองทุกใบ และจะแก้ไขไม่ได้อีกหลังยืนยัน</Alert>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="ชื่อ-นามสกุล (ภาษาไทย)">
          <Input name="th" autoComplete="name" maxLength={120} />
        </Field>
        <Field label="Full name (English)">
          <Input name="en" autoComplete="name" maxLength={120} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" required className="mt-1 accent-green-700" />
          <span>ข้าพเจ้ายืนยันว่าชื่อ-นามสกุลนี้ถูกต้อง และรับทราบว่าจะไม่สามารถแก้ไขชื่อในใบรับรองได้อีก</span>
        </label>
        <Button type="submit" disabled={busy}>
          ยืนยันและล็อกชื่อ
        </Button>
      </form>
    </Card>
  );
}

export function IssueCertificateButton({ courseId, hasTh, hasEn }: { courseId: string; hasTh: boolean; hasEn: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const issue = async (locale: "th" | "en") => {
    setBusy(true);
    const r = await api(`/api/courses/${courseId}/certificate/issue`, { body: { locale } });
    setBusy(false);
    if (r.ok) router.refresh();
    else setError(r.message);
  };
  return (
    <Card className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-stone-700">ออกใบรับรองได้ 1 ใบต่อหลักสูตร เลือกภาษาของชื่อที่จะพิมพ์บนใบรับรอง</p>
      <div className="flex flex-wrap gap-2">
        {hasTh && (
          <Button disabled={busy} onClick={() => issue("th")}>
            ออกใบรับรอง (ชื่อภาษาไทย)
          </Button>
        )}
        {hasEn && (
          <Button variant={hasTh ? "secondary" : "primary"} disabled={busy} onClick={() => issue("en")}>
            Issue certificate (English name)
          </Button>
        )}
      </div>
    </Card>
  );
}

export function DownloadCertificateButton({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "working" | "rendering" | "error">("idle");
  async function download(attempt = 0): Promise<void> {
    setState("working");
    const res = await fetch(`/api/certificates/${code}/download`, { credentials: "same-origin", cache: "no-store" });
    if (res.status === 202) {
      setState("rendering");
      if (attempt < 12) {
        await new Promise((r) => setTimeout(r, 5000));
        return download(attempt + 1);
      }
      return setState("error");
    }
    if (!res.ok) return setState("error");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${code}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    setState("idle");
  }
  return (
    <div className="space-y-2">
      <Button onClick={() => void download()} disabled={state === "working" || state === "rendering"}>
        {state === "rendering" ? "กำลังสร้างไฟล์ PDF…" : "ดาวน์โหลด PDF"}
      </Button>
      {state === "error" && <Alert tone="error">ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่ภายหลัง</Alert>}
    </div>
  );
}
