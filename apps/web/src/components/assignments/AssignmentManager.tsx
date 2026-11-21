"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Ban, CalendarClock, Clipboard, Plus, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { toBangkokInput, formatDateTimeTh } from "@/lib/format";
import { Badge, Button, Card, Dialog, Field, Input, Select, Table, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, useToast } from "@/components/ui";

type BulkRow = { email: string; status: "added" | "already_member" | "not_found" | "duplicate" };

interface Assignment { id: string; status: string; due_at: Date | string | null; note: string | null; course_title: string; target_name: string; recipient_count: number; completed_count: number }
interface Props {
  courses: Array<{ id: string; title: string }>;
  groups: Array<{ id: string; name: string; description: string | null; member_count: number }>;
  assignments: Assignment[];
}

export function AssignmentManager({ courses, groups, assignments }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [targetType, setTargetType] = useState<"user" | "group">("user");
  const [busy, setBusy] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkEmails, setBulkEmails] = useState("");
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [bulkPreview, setBulkPreview] = useState<{ rows: BulkRow[]; added: number } | null>(null);
  const [editingDue, setEditingDue] = useState<{ id: string; due_at: Date | string | null } | null>(null);
  const [newDue, setNewDue] = useState("");

  const done = (title: string) => { setBusy(false); toast({ title, variant: "success" }); router.refresh(); };
  const failed = (message: string) => { setBusy(false); toast({ title: "ทำรายการไม่สำเร็จ", description: message, variant: "destructive" }); };

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    const result = await api("/api/manage/groups", { body: { name: form.get("name"), description: form.get("description") || undefined } });
    if (result.ok) { event.currentTarget.reset(); done("สร้างกลุ่มแล้ว"); } else failed(result.message);
  }

  async function member(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    const groupId = String(form.get("group_id"));
    const result = await api(`/api/manage/groups/${groupId}/members`, { body: { email: form.get("email"), operation: form.get("operation") } });
    if (result.ok) { event.currentTarget.reset(); done("ปรับสมาชิกกลุ่มแล้ว"); } else failed(result.message);
  }

  function parseBulkEmails() {
    return bulkEmails.split(/[\n\r,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  }

  async function bulkRunPreview() {
    const emails = parseBulkEmails();
    if (!bulkGroupId || emails.length === 0) return;
    setBusy(true);
    setBulkPreview(null);
    const r = await api(`/api/manage/groups/${bulkGroupId}/members/bulk`, { body: { emails, preview: true } });
    setBusy(false);
    if (r.ok) setBulkPreview(r as unknown as { rows: BulkRow[]; added: number });
    else failed(r.message);
  }

  async function bulkCommit() {
    const emails = parseBulkEmails();
    if (!bulkGroupId || emails.length === 0 || !bulkPreview) return;
    setBusy(true);
    const r = await api(`/api/manage/groups/${bulkGroupId}/members/bulk`, { body: { emails, preview: false } });
    setBusy(false);
    if (r.ok) {
      setBulkPreview(null);
      setBulkEmails("");
      done(`เพิ่มสมาชิก ${(r as unknown as { added: number }).added} คนแล้ว`);
    } else failed(r.message);
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    const due = String(form.get("due_at") ?? "");
    const result = await api("/api/manage/assignments", { body: {
      course_id: form.get("course_id"), target_type: targetType, target: form.get("target"),
      ...(due ? { due_at: new Date(due).toISOString() } : {}), ...(form.get("note") ? { note: form.get("note") } : {}),
    } });
    if (result.ok) { event.currentTarget.reset(); done("มอบหมายหลักสูตรแล้ว"); } else failed(result.message);
  }

  async function cancel(id: string) {
    setBusy(true);
    const result = await api(`/api/manage/assignments/${id}/cancel`, { method: "POST" });
    if (result.ok) done("ยกเลิกการมอบหมายแล้ว"); else failed(result.message);
  }

  async function updateDue() {
    if (!editingDue) return;
    setBusy(true);
    const result = await api(`/api/manage/assignments/${editingDue.id}`, {
      method: "PATCH",
      body: { dueAt: newDue ? new Date(newDue).toISOString() : null },
    });
    setBusy(false);
    if (result.ok) {
      toast({ title: "แก้กำหนดเวลาแล้ว", variant: "success" });
      setEditingDue(null);
      router.refresh();
    } else toast({ title: "ทำรายการไม่สำเร็จ", description: result.message, variant: "destructive" });
  }

  return (
    <Tabs defaultValue="assign">
      <TabsList>
        <TabsTrigger value="assign">มอบหมายหลักสูตร</TabsTrigger>
        <TabsTrigger value="groups">กลุ่มผู้เรียน</TabsTrigger>
        <TabsTrigger value="history">รายการมอบหมาย</TabsTrigger>
      </TabsList>

      <TabsContent value="assign" className="mt-5">
        <Card className="max-w-2xl p-6">
          <form onSubmit={assign} className="grid gap-4">
            <Field label="หลักสูตร">
              <Select name="course_id" required><option value="">เลือกหลักสูตร</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</Select>
            </Field>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field label="ประเภทผู้รับ">
                <Select value={targetType} onChange={(event) => setTargetType(event.target.value as "user" | "group")}>
                  <option value="user">รายบุคคล</option>
                  <option value="group">กลุ่มผู้เรียน</option>
                </Select>
              </Field>
              <Field label={targetType === "user" ? "อีเมลผู้เรียน" : "กลุ่มผู้เรียน"}>
                {targetType === "user"
                  ? <Input name="target" type="email" required />
                  : <Select name="target" required><option value="">เลือกกลุ่ม</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.member_count})</option>)}</Select>}
              </Field>
            </div>
            <Field label="กำหนดเวลา" hint="ไม่บังคับ"><Input name="due_at" type="datetime-local" /></Field>
            <Field label="หมายเหตุ" hint="ไม่บังคับ"><Textarea name="note" maxLength={2000} rows={3} /></Field>
            <Button type="submit" loading={busy} className="justify-self-start"><UserPlus className="h-4 w-4" /> มอบหมาย</Button>
          </form>
        </Card>
      </TabsContent>

      <TabsContent value="groups" className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <form onSubmit={createGroup} className="grid gap-4">
            <Field label="ชื่อกลุ่ม"><Input name="name" required maxLength={255} /></Field>
            <Field label="คำอธิบาย"><Textarea name="description" rows={3} maxLength={2000} /></Field>
            <Button type="submit" loading={busy} className="justify-self-start"><Plus className="h-4 w-4" /> สร้างกลุ่ม</Button>
          </form>
        </Card>
        <Card className="p-6 grid gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">ปรับสมาชิกกลุ่ม</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setBulkMode(!bulkMode); setBulkPreview(null); }}>
              <Clipboard className="h-4 w-4 mr-1" />{bulkMode ? "รายเดียว" : "วางรายการ"}
            </Button>
          </div>
          {!bulkMode ? (
            <form onSubmit={member} className="grid gap-4">
              <Field label="กลุ่ม"><Select name="group_id" required><option value="">เลือกกลุ่ม</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.member_count})</option>)}</Select></Field>
              <Field label="อีเมลผู้ใช้"><Input name="email" type="email" required /></Field>
              <Field label="รายการ"><Select name="operation"><option value="add">เพิ่มเข้ากลุ่ม</option><option value="remove">นำออกจากกลุ่ม</option></Select></Field>
              <Button type="submit" loading={busy} className="justify-self-start">บันทึกสมาชิก</Button>
            </form>
          ) : (
            <div className="grid gap-4">
              <Field label="กลุ่ม">
                <Select value={bulkGroupId} onChange={(e) => { setBulkGroupId(e.currentTarget.value); setBulkPreview(null); }}>
                  <option value="">เลือกกลุ่ม</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.member_count})</option>)}
                </Select>
              </Field>
              <Field label="อีเมล" hint="หลายรายการคั่นด้วยบรรทัดใหม่ จุลภาค หรือเซมิโคลอน">
                <Textarea value={bulkEmails} onChange={(e) => { setBulkEmails(e.currentTarget.value); setBulkPreview(null); }} rows={6} placeholder={"user1@example.com\nuser2@example.com"} />
              </Field>
              <div className="flex items-center gap-2">
                <Button loading={busy} disabled={!bulkGroupId || !bulkEmails.trim()} variant="outline" onClick={() => void bulkRunPreview()}>
                  ดูตัวอย่าง
                </Button>
                {bulkPreview && bulkPreview.added > 0 && (
                  <Button loading={busy} onClick={() => void bulkCommit()}>
                    ยืนยันเพิ่ม {bulkPreview.added} คน
                  </Button>
                )}
              </div>
              {bulkPreview && (
                <div className="grid gap-1 text-sm max-h-56 overflow-y-auto rounded border p-2">
                  {bulkPreview.rows.map((r) => {
                    const cls = r.status === "added" ? "text-green-600" : r.status === "not_found" ? "text-destructive" : "text-muted-foreground";
                    const label = r.status === "added" ? "✓ จะเพิ่ม" : r.status === "already_member" ? "○ เป็นสมาชิกอยู่แล้ว" : r.status === "not_found" ? "✗ ไม่พบผู้ใช้" : "⚠ ซ้ำในรายการ";
                    return (
                      <div key={r.email} className={cls}>{label} — {r.email}</div>
                    );
                  })}
                  {bulkPreview.added === 0 && <p className="text-muted-foreground text-xs mt-1">ไม่มีรายการที่จะเพิ่ม</p>}
                </div>
              )}
            </div>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="history" className="mt-5">
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th>หลักสูตร</th>
                <th>ผู้รับ</th>
                <th>ความคืบหน้า</th>
                <th>กำหนดเวลา</th>
                <th>สถานะ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assignments.map((item) => (
                <tr key={item.id}>
                  <td>{item.course_title}</td>
                  <td>{item.target_name}</td>
                  <td>{item.completed_count}/{item.recipient_count}</td>
                  <td className="whitespace-nowrap">
                    {item.due_at ? formatDateTimeTh(item.due_at) : "—"}
                  </td>
                  <td><Badge variant={item.status === "active" ? "success" : "secondary"}>{item.status === "active" ? "ใช้งาน" : "ยกเลิก"}</Badge></td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      {item.status === "active" && (
                        <>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditingDue(item); setNewDue(item.due_at ? toBangkokInput(item.due_at) : ""); }}>
                            <CalendarClock className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void cancel(item.id)}><Ban className="h-4 w-4" /> ยกเลิก</Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {assignments.length === 0 && <p className="p-6 text-sm text-muted-foreground">ยังไม่มีรายการมอบหมาย</p>}
        </Card>
      </TabsContent>

      <Dialog open={!!editingDue} onOpenChange={(o) => { if (!o) setEditingDue(null); }} title="แก้กำหนดเวลา">
        <div className="grid gap-4">
          <Field label="กำหนดเวลาใหม่" hint="เว้นว่าง = ไม่มีกำหนด">
            <Input type="datetime-local" value={newDue} onChange={(e) => setNewDue(e.currentTarget.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingDue(null)}>ยกเลิก</Button>
            <Button loading={busy} onClick={() => void updateDue()}>บันทึก</Button>
          </div>
        </div>
      </Dialog>
    </Tabs>
  );
}
