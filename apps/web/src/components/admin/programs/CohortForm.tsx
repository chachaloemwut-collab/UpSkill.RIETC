"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Ban, CalendarClock, Globe, Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { fromBangkokInput, toBangkokInput } from "@/lib/format";
import { Alert, AlertDialog, Button, Checkbox, Dialog, Field, Input, MultiSelect, Select, TagInput, useToast } from "@/components/ui";

type FormField = { key: string; label: string; type: "text" | "textarea"; required: boolean };
export type Rules = { emailDomains: string[]; groupIds: string[]; requireLegalName: boolean; prerequisiteCourseIds: string[]; applicationForm: FormField[] };
export type CohortDefaults = {
  title: string;
  registration_opens_at: Date | string | null;
  registration_closes_at: Date | string | null;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  capacity: number | null;
  waitlist_enabled: boolean;
  requires_approval: boolean;
  rules: Rules;
};
type Option = { id: string; name: string };

const EMPTY: CohortDefaults = {
  title: "",
  registration_opens_at: null,
  registration_closes_at: null,
  starts_at: null,
  ends_at: null,
  capacity: null,
  waitlist_enabled: false,
  requires_approval: false,
  rules: { emailDomains: [], groupIds: [], requireLegalName: false, prerequisiteCourseIds: [], applicationForm: [] },
};

function CohortFields({ defaults, groups, courses, onSubmit, busy, error, submitLabel }: {
  defaults: CohortDefaults;
  groups: Option[];
  courses: Option[];
  onSubmit: (body: unknown) => void;
  busy: boolean;
  error: string | null;
  submitLabel: string;
}) {
  const [rules, setRules] = useState<Rules>(defaults.rules);
  const [localError, setLocalError] = useState<string | null>(null);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dates = ["registrationOpensAt", "registrationClosesAt", "startsAt", "endsAt"].map((k) => fromBangkokInput(f.get(k)));
    if (dates.some((d) => !d)) return setLocalError("กรุณากรอกวันที่ให้ครบ");
    const cap = String(f.get("capacity") ?? "").trim();
    const fields = rules.applicationForm.filter((x) => x.label.trim());
    setLocalError(null);
    onSubmit({
      title: f.get("title"),
      registrationOpensAt: dates[0],
      registrationClosesAt: dates[1],
      startsAt: dates[2],
      endsAt: dates[3],
      capacity: cap ? Number(cap) : null,
      waitlistEnabled: f.get("waitlistEnabled") === "on",
      requiresApproval: f.get("requiresApproval") === "on",
      eligibility: { ...rules, applicationForm: fields.map((x, i) => ({ ...x, key: x.key || `q${i + 1}`, label: x.label.trim() })) },
    });
  }
  const setField = (i: number, patch: Partial<FormField>) => setRules((r) => ({ ...r, applicationForm: r.applicationForm.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  return (
    <form onSubmit={submit} className="grid gap-5">
      {(error || localError) && <Alert variant="destructive" title={localError ?? error!} />}
      <Field label="ชื่อรอบ"><Input name="title" defaultValue={defaults.title} maxLength={255} required placeholder="เช่น รุ่นที่ 1 / 2570" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="เปิดรับสมัคร (เวลาไทย)"><Input type="datetime-local" name="registrationOpensAt" defaultValue={toBangkokInput(defaults.registration_opens_at)} required /></Field>
        <Field label="ปิดรับสมัคร (เวลาไทย)"><Input type="datetime-local" name="registrationClosesAt" defaultValue={toBangkokInput(defaults.registration_closes_at)} required /></Field>
        <Field label="เริ่มอบรม" hint="ผู้ได้รับอนุมัติเริ่มเข้าเรียนได้ตั้งแต่เวลานี้"><Input type="datetime-local" name="startsAt" defaultValue={toBangkokInput(defaults.starts_at)} required /></Field>
        <Field label="สิ้นสุดอบรม"><Input type="datetime-local" name="endsAt" defaultValue={toBangkokInput(defaults.ends_at)} required /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="จำนวนที่นั่ง" hint="เว้นว่าง = ไม่จำกัด"><Input type="number" name="capacity" min={1} max={100000} defaultValue={defaults.capacity ?? ""} /></Field>
        <div className="grid content-end gap-2 pb-1">
          <Checkbox name="waitlistEnabled" defaultChecked={defaults.waitlist_enabled} label="รับรายชื่อสำรองเมื่อที่นั่งเต็ม" />
          <Checkbox name="requiresApproval" defaultChecked={defaults.requires_approval} label="ผู้ดูแลต้องอนุมัติใบสมัคร" />
        </div>
      </div>

      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">เงื่อนไขผู้สมัคร</legend>
        <Field label="โดเมนอีเมลที่อนุญาต" hint="เว้นว่าง = ทุกอีเมล · เช่น rietc.ac.th (รวมโดเมนย่อย)">
          <TagInput value={rules.emailDomains} onValueChange={(v) => setRules((r) => ({ ...r, emailDomains: v.map((d) => d.trim().toLowerCase().replace(/^@/, "")) }))} placeholder="พิมพ์โดเมนแล้วกด Enter" />
        </Field>
        <Field label="ต้องเป็นสมาชิกกลุ่มผู้เรียน" hint="อย่างน้อยหนึ่งกลุ่ม · จัดการกลุ่มได้ที่หน้ามอบหมายหลักสูตร">
          <MultiSelect value={rules.groupIds} onValueChange={(v) => setRules((r) => ({ ...r, groupIds: v }))} placeholder="ไม่จำกัดกลุ่ม" options={groups.map((g) => ({ value: g.id, label: g.name }))} />
        </Field>
        <Field label="ต้องเรียนจบรายวิชาก่อน">
          <MultiSelect value={rules.prerequisiteCourseIds} onValueChange={(v) => setRules((r) => ({ ...r, prerequisiteCourseIds: v }))} placeholder="ไม่มีรายวิชาพื้นฐาน" options={courses.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Checkbox checked={rules.requireLegalName} onChange={(e) => setRules((r) => ({ ...r, requireLegalName: e.currentTarget.checked }))} label="ต้องกรอกชื่อ-นามสกุลจริงในบัญชีก่อนสมัคร" />
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">คำถามในใบสมัคร</legend>
        {rules.applicationForm.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีคำถาม ผู้ใช้กดสมัครได้ทันที</p>}
        {rules.applicationForm.map((q, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input className="min-w-48 flex-1" value={q.label} maxLength={120} placeholder="คำถาม เช่น หน่วยงาน" onChange={(e) => setField(i, { label: e.currentTarget.value })} />
            <div className="w-36">
              <Select value={q.type} onValueChange={(v) => setField(i, { type: v === "textarea" ? "textarea" : "text" })}>
                <option value="text">ข้อความสั้น</option>
                <option value="textarea">ข้อความยาว</option>
              </Select>
            </div>
            <Checkbox checked={q.required} onChange={(e) => setField(i, { required: e.currentTarget.checked })} label="บังคับ" />
            <Button type="button" variant="ghost" size="icon" aria-label="ลบคำถาม" onClick={() => setRules((r) => ({ ...r, applicationForm: r.applicationForm.filter((_, j) => j !== i) }))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {rules.applicationForm.length < 10 && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRules((r) => ({ ...r, applicationForm: [...r.applicationForm, { key: `q${Date.now().toString(36)}`, label: "", type: "text", required: false }] }))}
            >
              <Plus className="h-4 w-4" /> เพิ่มคำถาม
            </Button>
          </div>
        )}
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" loading={busy}><Save className="h-4 w-4" /> {submitLabel}</Button>
      </div>
    </form>
  );
}

export function CreateCohortDialog({ programId, groups, courses }: { programId: string; groups: Option[]; courses: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(body: unknown) {
    setBusy(true);
    setError(null);
    const r = await api<{ id: string }>(`/api/admin/programs/${programId}/cohorts`, { body });
    setBusy(false);
    if (r.ok) router.push(`/admin/cohorts/${r.data.id}`);
    else setError(r.message);
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> เพิ่มรอบอบรม</Button>
      <Dialog open={open} onOpenChange={setOpen} title="เพิ่มรอบอบรม" description="สร้างเป็นฉบับร่างก่อน ตรวจสอบแล้วจึงกดเผยแพร่รอบ" className="max-w-2xl">
        {open && <CohortFields defaults={EMPTY} groups={groups} courses={courses} onSubmit={onSubmit} busy={busy} error={error} submitLabel="สร้างรอบอบรม" />}
      </Dialog>
    </>
  );
}

export function EditCohortForm({ cohortId, defaults, groups, courses }: { cohortId: string; defaults: CohortDefaults; groups: Option[]; courses: Option[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(body: unknown) {
    setBusy(true);
    setError(null);
    const r = await api(`/api/admin/cohorts/${cohortId}`, { method: "PATCH", body });
    setBusy(false);
    if (r.ok) {
      toast({ title: "บันทึกรอบอบรมแล้ว", variant: "success" });
      router.refresh();
    } else setError(r.message);
  }
  return <CohortFields defaults={defaults} groups={groups} courses={courses} onSubmit={onSubmit} busy={busy} error={error} submitLabel="บันทึกรอบอบรม" />;
}

/** Shift all dates on a cohort by a given number of days */
export function ShiftDatesButton({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = parseInt(days, 10);
  const valid = !isNaN(n) && n !== 0 && Math.abs(n) <= 365;
  async function shift() {
    setBusy(true); setError(null);
    const r = await api(`/api/admin/cohorts/${cohortId}/shift-dates`, { method: "POST", body: { days: n } });
    setBusy(false);
    if (r.ok) {
      toast({ title: `เลื่อนวันทั้งหมด ${n > 0 ? "+" : ""}${n} วันแล้ว`, variant: "success" });
      setOpen(false); setDays("");
      router.refresh();
    } else setError(r.message);
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><CalendarClock className="h-4 w-4" /> เลื่อนวันทั้งหมด</Button>
      <Dialog open={open} onOpenChange={setOpen} title="เลื่อนวันทั้งหมด" description="เลื่อนวันเปิดรับสมัคร ปิดรับสมัคร เริ่มอบรม และสิ้นสุดอบรมพร้อมกัน">
        {error && <div className="mb-4"><Alert variant="destructive" title={error} /></div>}
        <div className="grid gap-4">
          <Field label="จำนวนวัน" hint="ตัวเลขบวก = เลื่อนไปหน้า · ตัวเลขลบ = ย้อนกลับ">
            <Input type="number" value={days} onChange={(e) => setDays(e.currentTarget.value)} min={-365} max={365} placeholder="เช่น 7 หรือ -3" />
          </Field>
          {valid && <p className="text-sm text-muted-foreground">วันทั้งหมดจะ{n > 0 ? "เลื่อนไปข้างหน้า" : "ย้อนกลับ"} {Math.abs(n)} วัน</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button loading={busy} disabled={!valid} onClick={() => void shift()}>ยืนยัน</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function CohortStatusActions({ cohortId, status }: { cohortId: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  async function act(action: "publish" | "cancel") {
    setBusy(true);
    const r = await api(`/api/admin/cohorts/${cohortId}/status`, { method: "PATCH", body: { action } });
    setBusy(false);
    if (r.ok) {
      toast({ title: action === "publish" ? "เผยแพร่รอบอบรมแล้ว" : "ยกเลิกรอบอบรมแล้ว", variant: "success" });
      router.refresh();
    } else toast({ title: "ทำรายการไม่สำเร็จ", description: r.message, variant: "destructive" });
  }
  if (status === "cancelled") return null;
  return (
    <>
      {status === "draft" && <Button loading={busy} onClick={() => void act("publish")}><Globe className="h-4 w-4" /> เผยแพร่รอบ</Button>}
      <Button variant="outline" className="text-destructive" disabled={busy} onClick={() => setConfirmCancel(true)}><Ban className="h-4 w-4" /> ยกเลิกรอบ</Button>
      <AlertDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="ยกเลิกรอบอบรมนี้?"
        description="ใบสมัครทั้งหมดจะถูกยกเลิก สิทธิ์เข้าเรียนที่ได้จากรอบนี้จะถูกเพิกถอน และระบบจะส่งอีเมลแจ้งผู้สมัครทุกคน การยกเลิกย้อนกลับไม่ได้"
        confirmLabel="ยกเลิกรอบ"
        cancelLabel="ไม่ยกเลิก"
        destructive
        onConfirm={() => void act("cancel")}
      />
    </>
  );
}
