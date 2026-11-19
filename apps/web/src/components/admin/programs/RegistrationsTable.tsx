"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Download, X } from "lucide-react";
import { api } from "@/lib/api";
import { REGISTRATION_STATUS, formatDateTimeTh } from "@/lib/format";
import { Badge, Button, Checkbox, Dialog, EmptyState, Field, SegmentedControl, Table, Textarea, useToast } from "@/components/ui";

type Registration = {
  id: string;
  status: string;
  email: string;
  name: string | null;
  phone: string | null;
  applied_at: Date | string;
  decided_at: Date | string | null;
  decision_note: string | null;
  answers: Record<string, string>;
};
type FormField = { key: string; label: string };

export function RegistrationsTable({ cohortId, registrations, form, cancelled }: { cohortId: string; registrations: Registration[]; form: FormField[]; cancelled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [filter, setFilter] = useState(() => searchParams.get("regStatus") ?? "pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ decision: string; changed: number; total: number } | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: registrations.length };
    for (const r of registrations) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [registrations]);
  const shown = filter === "all" ? registrations : registrations.filter((r) => r.status === filter);
  const actionable = (r: Registration) => !cancelled && ["pending", "waitlisted", "approved"].includes(r.status);
  const picked = shown.filter((r) => selected.has(r.id));
  const canApprove = picked.length > 0 && picked.every((r) => r.status === "pending" || r.status === "waitlisted");
  const canReject = picked.length > 0;

  async function decide(decision: "approve" | "reject", ids: string[], decisionNote?: string) {
    setBusy(true);
    const r = await api<{ changed: number }>(`/api/admin/cohorts/${cohortId}/registrations`, { method: "PATCH", body: { ids, decision, ...(decisionNote ? { note: decisionNote } : {}) } });
    setBusy(false);
    if (r.ok) {
      setBulkResult({ decision, changed: r.data.changed, total: ids.length });
      setSelected(new Set());
      setApproving(false);
      setRejecting(false);
      setNote("");
      router.refresh();
    } else toast({ title: "ทำรายการไม่สำเร็จ", description: r.message, variant: "destructive" });
  }

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const selectable = shown.filter(actionable);
  const allPicked = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          value={filter}
          onValueChange={(v) => {
            setFilter(v);
            setSelected(new Set());
            const p = new URLSearchParams(searchParams.toString());
            if (v === "pending") p.delete("regStatus"); else p.set("regStatus", v);
            router.replace(`?${p.toString()}`, { scroll: false });
          }}
          options={[
            { value: "pending", label: `รอพิจารณา (${counts.pending ?? 0})` },
            { value: "approved", label: `อนุมัติ (${counts.approved ?? 0})` },
            { value: "waitlisted", label: `สำรอง (${counts.waitlisted ?? 0})` },
            { value: "rejected", label: `ไม่อนุมัติ (${counts.rejected ?? 0})` },
            { value: "all", label: `ทั้งหมด (${counts.all})` },
          ]}
        />
        <a href={`/api/admin/cohorts/${cohortId}/registrations/export`} className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4" /> ส่งออก CSV
        </a>
      </div>

      {picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <span>เลือก {picked.length} คน</span>
          <Button size="sm" loading={busy} disabled={!canApprove} onClick={() => setApproving(true)}><Check className="h-4 w-4" /> อนุมัติ</Button>
          <Button size="sm" variant="outline" disabled={!canReject || busy} onClick={() => setRejecting(true)}><X className="h-4 w-4" /> ไม่อนุมัติ</Button>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState title="ไม่มีผู้สมัครในสถานะนี้" />
      ) : (
        <div className="overflow-x-auto">
          <Table className="[&_td]:py-2.5 [&_td]:align-top">
            <thead>
              <tr>
                <th className="w-10">
                  <Checkbox aria-label="เลือกทั้งหมด" checked={allPicked} disabled={selectable.length === 0} onChange={() => setSelected(allPicked ? new Set() : new Set(selectable.map((r) => r.id)))} />
                </th>
                <th>ผู้สมัคร</th>
                <th>สถานะ</th>
                <th>วันที่สมัคร</th>
                {form.map((f) => <th key={f.key}>{f.label}</th>)}
                <th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = REGISTRATION_STATUS[r.status];
                return (
                  <tr key={r.id}>
                    <td><Checkbox aria-label={`เลือก ${r.email}`} checked={selected.has(r.id)} disabled={!actionable(r)} onChange={() => toggle(r.id)} /></td>
                    <td>
                      <p className="font-medium">{r.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.email}{r.phone && ` · ${r.phone}`}</p>
                    </td>
                    <td>
                      <Badge variant={st?.variant ?? "secondary"}>{st?.label ?? r.status}</Badge>
                      {r.decision_note && <p className="mt-1 max-w-48 text-xs text-muted-foreground">{r.decision_note}</p>}
                    </td>
                    <td className="whitespace-nowrap text-muted-foreground">{formatDateTimeTh(r.applied_at)}</td>
                    {form.map((f) => <td key={f.key} className="max-w-64 whitespace-pre-line break-words text-sm">{r.answers[f.key] ?? ""}</td>)}
                    <td className="text-right">
                      {actionable(r) && (
                        <div className="flex justify-end gap-1">
                          {r.status !== "approved" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("approve", [r.id])}>อนุมัติ</Button>}
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setSelected(new Set([r.id])); setRejecting(true); }}>ไม่อนุมัติ</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      <Dialog open={approving} onOpenChange={setApproving} title={`ยืนยันอนุมัติ ${picked.length} คน`} description="ผู้สมัครจะได้รับอีเมลแจ้งผลและสิทธิ์เข้าเรียนในรอบนี้">
        <div className="grid gap-4">
          <div className="max-h-48 overflow-y-auto rounded border">
            {picked.map((r) => (
              <div key={r.id} className="flex items-baseline gap-2 border-b px-3 py-2 last:border-0 text-sm">
                <span className="font-medium">{r.name ?? "—"}</span>
                <span className="text-muted-foreground text-xs">{r.email}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setApproving(false)}>ยกเลิก</Button>
            <Button loading={busy} onClick={() => void decide("approve", picked.map((r) => r.id))}>ยืนยันอนุมัติ</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={rejecting} onOpenChange={setRejecting} title="ไม่อนุมัติใบสมัคร" description="ผู้สมัครจะได้รับอีเมลแจ้งผล หากได้รับอนุมัติไปแล้ว สิทธิ์เข้าเรียนจากรอบนี้จะถูกเพิกถอน">
        <div className="grid gap-4">
          <div className="max-h-36 overflow-y-auto rounded border text-sm">
            {picked.map((r) => (
              <div key={r.id} className="flex items-baseline gap-2 border-b px-3 py-1.5 last:border-0">
                <span className="font-medium">{r.name ?? "—"}</span>
                <span className="text-muted-foreground text-xs">{r.email}</span>
              </div>
            ))}
          </div>
          <Field label="หมายเหตุถึงผู้สมัคร" hint="ไม่บังคับ แสดงในอีเมลและหน้าหลักสูตรของผู้สมัคร">
            <Textarea value={note} onChange={(e) => setNote(e.currentTarget.value)} rows={3} maxLength={2000} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejecting(false)}>ยกเลิก</Button>
            <Button variant="destructive" loading={busy} onClick={() => void decide("reject", [...selected], note.trim() || undefined)}>ยืนยันไม่อนุมัติ</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!bulkResult} onOpenChange={(o) => { if (!o) setBulkResult(null); }} title="ผลดำเนินการ">
        {bulkResult && (
          <div className="grid gap-4">
            <p className="text-sm">
              {bulkResult.decision === "approve" ? "อนุมัติสำเร็จ" : "ไม่อนุมัติสำเร็จ"}{" "}
              <span className="font-semibold">{bulkResult.changed}</span> คน
              {bulkResult.changed < bulkResult.total && ` (ข้ามไป ${bulkResult.total - bulkResult.changed} คนที่สถานะเปลี่ยนแล้ว)`}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setBulkResult(null)}>ตกลง</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
