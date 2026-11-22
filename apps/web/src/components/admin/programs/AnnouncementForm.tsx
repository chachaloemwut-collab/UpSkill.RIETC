"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Archive, Globe, Mail, Save, Trash2, EyeOff, Users } from "lucide-react";
import { api } from "@/lib/api";
import { fromBangkokInput, toBangkokInput } from "@/lib/format";
import { Alert, AlertDialog, Button, Checkbox, Field, Input, Select, Textarea, useToast } from "@/components/ui";

export type AnnouncementDefaults = {
  id?: string;
  title: string;
  summary: string | null;
  body: string;
  kind: string;
  program_id: string | null;
  cohort_id: string | null;
  location: string | null;
  event_starts_at: Date | string | null;
  event_ends_at: Date | string | null;
  publish_at: Date | string | null;
  expires_at: Date | string | null;
  is_pinned: boolean;
  scheduled_broadcast_at?: Date | string | null;
};

type Cohort = { id: string; title: string; program_id: string };

export function AnnouncementForm({ defaults, programs, cohorts }: {
  defaults: AnnouncementDefaults;
  programs: Array<{ id: string; title: string }>;
  cohorts: Cohort[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [programId, setProgramId] = useState(defaults.program_id ?? "");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  const programCohorts = cohorts.filter((c) => c.program_id === programId);

  async function fetchRecipientCount() {
    if (!defaults.id) return;
    setCountLoading(true);
    const r = await api<{ count: number }>(`/api/admin/announcements/${defaults.id}/recipients`);
    setCountLoading(false);
    if (r.ok) setRecipientCount(r.data.count);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const publishAt = fromBangkokInput(f.get("publishAt"));
    if (!publishAt) return setError("กรุณาระบุวันเวลาเผยแพร่");
    const body = {
      title: f.get("title"),
      summary: String(f.get("summary") ?? "").trim() || null,
      body: f.get("body"),
      kind: f.get("kind"),
      programId: String(f.get("programId") ?? "") || null,
      cohortId: String(f.get("cohortId") ?? "") || null,
      location: String(f.get("location") ?? "").trim() || null,
      eventStartsAt: fromBangkokInput(f.get("eventStartsAt")),
      eventEndsAt: fromBangkokInput(f.get("eventEndsAt")),
      publishAt,
      expiresAt: fromBangkokInput(f.get("expiresAt")),
      isPinned: f.get("isPinned") === "on",
      scheduledBroadcastAt: fromBangkokInput(f.get("scheduledBroadcastAt")),
    };
    setBusy(true);
    setError(null);
    const r = defaults.id
      ? await api(`/api/admin/announcements/${defaults.id}`, { method: "PATCH", body })
      : await api<{ id: string }>("/api/admin/announcements", { body });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    toast({ title: "บันทึกประกาศแล้ว", variant: "success" });
    if (!defaults.id) router.push(`/admin/announcements/${(r.data as { id: string }).id}`);
    else router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      {error && <Alert variant="destructive" title={error} />}
      <div className="grid gap-4 md:grid-cols-[1fr_200px]">
        <Field label="หัวข้อ"><Input name="title" defaultValue={defaults.title} minLength={3} maxLength={255} required /></Field>
        <Field label="ประเภท">
          <Select name="kind" defaultValue={defaults.kind}>
            <option value="event">กิจกรรม</option>
            <option value="news">ข่าวสาร</option>
            <option value="notice">ประกาศ</option>
          </Select>
        </Field>
      </div>
      <Field label="สรุปสั้น" hint="แสดงบนการ์ดประกาศและในอีเมล"><Textarea name="summary" defaultValue={defaults.summary ?? ""} rows={2} maxLength={500} /></Field>
      <Field label="เนื้อหา" hint="รองรับหัวข้อ (## ข้อความ), รายการ (- ข้อความ), ย่อหน้า และลิงก์ https://">
        <Textarea name="body" defaultValue={defaults.body} rows={12} maxLength={20000} required />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="เชื่อมกับหลักสูตรรวม" hint="แสดงปุ่มไปยังหน้าหลักสูตร">
          <Select name="programId" value={programId} onChange={(e) => { setProgramId(e.currentTarget.value); setRecipientCount(null); }}>
            <option value="">ไม่เชื่อม</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </Field>
        <Field label="จำกัดส่งอีเมลเฉพาะรอบ" hint={programId ? "ผู้ที่ได้รับอนุมัติเข้ารอบนี้เท่านั้น" : "เลือกหลักสูตรรวมก่อน"}>
          <Select name="cohortId" defaultValue={defaults.cohort_id ?? ""} disabled={!programId || programCohorts.length === 0}>
            <option value="">ส่งทุกคน (ไม่จำกัดรอบ)</option>
            {programCohorts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        </Field>
        <Field label="สถานที่" hint="ไม่บังคับ เช่น ห้องประชุม 1 หรือ ออนไลน์"><Input name="location" defaultValue={defaults.location ?? ""} maxLength={255} /></Field>
        <Field label="ส่งอีเมลอัตโนมัติเมื่อถึงเวลา" hint="เว้นว่าง = ส่งด้วยตนเอง">
          <div className="flex gap-2">
            <Input type="datetime-local" name="scheduledBroadcastAt" defaultValue={toBangkokInput(defaults.scheduled_broadcast_at)} className="flex-1" />
            {defaults.id && (
              <Button type="button" variant="outline" size="sm" loading={countLoading} onClick={() => void fetchRecipientCount()} title="ดูจำนวนผู้รับโดยประมาณ">
                <Users className="h-4 w-4" />
              </Button>
            )}
          </div>
          {recipientCount !== null && <p className="mt-1 text-xs text-muted-foreground">ผู้รับโดยประมาณ {recipientCount.toLocaleString("th-TH")} คน</p>}
        </Field>
        <Field label="วันเริ่มกิจกรรม" hint="ไม่บังคับ"><Input type="datetime-local" name="eventStartsAt" defaultValue={toBangkokInput(defaults.event_starts_at)} /></Field>
        <Field label="วันสิ้นสุดกิจกรรม" hint="ไม่บังคับ"><Input type="datetime-local" name="eventEndsAt" defaultValue={toBangkokInput(defaults.event_ends_at)} /></Field>
        <Field label="เริ่มแสดงประกาศ (เวลาไทย)"><Input type="datetime-local" name="publishAt" defaultValue={toBangkokInput(defaults.publish_at ?? new Date())} required /></Field>
        <Field label="หยุดแสดงประกาศ" hint="เว้นว่าง = แสดงตลอด"><Input type="datetime-local" name="expiresAt" defaultValue={toBangkokInput(defaults.expires_at)} /></Field>
      </div>
      <Checkbox name="isPinned" defaultChecked={defaults.is_pinned} label="ปักหมุดไว้ด้านบน และแสดงบนหน้าแรก" />
      <div><Button type="submit" loadingState="saving" loading={busy}><Save className="h-4 w-4" /> บันทึก</Button></div>
    </form>
  );
}

export function AnnouncementActions({ id, visibility, broadcastAt }: { id: string; visibility: string; broadcastAt: Date | string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"broadcast" | "delete" | null>(null);
  async function call(path: string, init: { method?: string; body?: unknown }, done: (data: Record<string, unknown>) => string, after?: () => void) {
    setBusy(true);
    const r = await api<Record<string, unknown>>(path, init);
    setBusy(false);
    if (r.ok) {
      toast({ ...(path.endsWith("/broadcast") ? { brandState: "notification" as const } : {}), title: done(r.data), variant: "success" });
      if (after) after();
      else router.refresh();
    } else toast({ title: "ทำรายการไม่สำเร็จ", description: r.message, variant: "destructive" });
  }
  const setVis = (v: string, label: string) => void call(`/api/admin/announcements/${id}/visibility`, { method: "PATCH", body: { visibility: v } }, () => label);
  return (
    <>
      {visibility !== "published" && <Button loadingState="saving" loading={busy} onClick={() => setVis("published", "เผยแพร่ประกาศแล้ว")}><Globe className="h-4 w-4" /> เผยแพร่</Button>}
      {visibility === "published" && <Button variant="outline" disabled={busy} onClick={() => setVis("draft", "ถอยเป็นฉบับร่างแล้ว")}><EyeOff className="h-4 w-4" /> ถอยเป็นฉบับร่าง</Button>}
      {visibility !== "archived" && <Button variant="outline" disabled={busy} onClick={() => setVis("archived", "เก็บเข้าคลังแล้ว")}><Archive className="h-4 w-4" /> เก็บเข้าคลัง</Button>}
      {visibility === "published" && !broadcastAt && <Button variant="outline" disabled={busy} onClick={() => setConfirm("broadcast")}><Mail className="h-4 w-4" /> ส่งอีเมลประชาสัมพันธ์</Button>}
      {!broadcastAt && <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirm("delete")}><Trash2 className="h-4 w-4" /> ลบ</Button>}
      <AlertDialog
        open={confirm === "broadcast"}
        onOpenChange={(o) => setConfirm(o ? "broadcast" : null)}
        title="ส่งอีเมลประกาศนี้?"
        description="ส่งถึงผู้ใช้ที่ยืนยันอีเมลแล้วและเปิดรับข่าวสารหลักสูตร ส่งได้ครั้งเดียวต่อประกาศ"
        confirmLabel="ส่งอีเมล"
        cancelLabel="ยกเลิก"
        onConfirm={() => void call(`/api/admin/announcements/${id}/broadcast`, { method: "POST" }, (d) => `เข้าคิวส่งอีเมลแล้ว ${Number(d.queued ?? 0).toLocaleString("th-TH")} ฉบับ`)}
      />
      <AlertDialog
        open={confirm === "delete"}
        onOpenChange={(o) => setConfirm(o ? "delete" : null)}
        title="ลบประกาศนี้?"
        description="ลบแล้วกู้คืนไม่ได้"
        confirmLabel="ลบ"
        cancelLabel="ยกเลิก"
        destructive
        onConfirm={() => void call(`/api/admin/announcements/${id}`, { method: "DELETE" }, () => "ลบประกาศแล้ว", () => router.push("/admin/announcements"))}
      />
    </>
  );
}
