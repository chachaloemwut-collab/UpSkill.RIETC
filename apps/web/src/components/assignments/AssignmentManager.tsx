"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Ban, Plus, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, Card, Field, Input, Select, Table, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, useToast } from "@/components/ui";

interface Props {
  courses: Array<{ id: string; title: string }>;
  groups: Array<{ id: string; name: string; description: string | null; member_count: number }>;
  assignments: Array<{ id: string; status: string; due_at: Date | string | null; note: string | null; course_title: string; target_name: string; recipient_count: number; completed_count: number }>;
}

export function AssignmentManager({ courses, groups, assignments }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [targetType, setTargetType] = useState<"user" | "group">("user");
  const [busy, setBusy] = useState(false);
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

  return (
    <Tabs defaultValue="assign">
      <TabsList><TabsTrigger value="assign">มอบหมายหลักสูตร</TabsTrigger><TabsTrigger value="groups">กลุ่มผู้เรียน</TabsTrigger><TabsTrigger value="history">รายการมอบหมาย</TabsTrigger></TabsList>
      <TabsContent value="assign" className="mt-5">
        <Card className="max-w-2xl p-6">
          <form onSubmit={assign} className="grid gap-4">
            <Field label="หลักสูตร"><Select name="course_id" required><option value="">เลือกหลักสูตร</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</Select></Field>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field label="ประเภทผู้รับ"><Select value={targetType} onChange={(event) => setTargetType(event.target.value as "user" | "group")}><option value="user">รายบุคคล</option><option value="group">กลุ่มผู้เรียน</option></Select></Field>
              <Field label={targetType === "user" ? "อีเมลผู้เรียน" : "กลุ่มผู้เรียน"}>
                {targetType === "user" ? <Input name="target" type="email" required /> : <Select name="target" required><option value="">เลือกกลุ่ม</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.member_count})</option>)}</Select>}
              </Field>
            </div>
            <Field label="กำหนดเวลา" hint="ไม่บังคับ"><Input name="due_at" type="datetime-local" /></Field>
            <Field label="หมายเหตุ" hint="ไม่บังคับ"><Textarea name="note" maxLength={2000} rows={3} /></Field>
            <Button type="submit" loading={busy} className="justify-self-start"><UserPlus className="h-4 w-4" /> มอบหมาย</Button>
          </form>
        </Card>
      </TabsContent>
      <TabsContent value="groups" className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-6"><form onSubmit={createGroup} className="grid gap-4"><Field label="ชื่อกลุ่ม"><Input name="name" required maxLength={255} /></Field><Field label="คำอธิบาย"><Textarea name="description" rows={3} maxLength={2000} /></Field><Button type="submit" loading={busy} className="justify-self-start"><Plus className="h-4 w-4" /> สร้างกลุ่ม</Button></form></Card>
        <Card className="p-6"><form onSubmit={member} className="grid gap-4"><Field label="กลุ่ม"><Select name="group_id" required><option value="">เลือกกลุ่ม</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.member_count})</option>)}</Select></Field><Field label="อีเมลผู้ใช้"><Input name="email" type="email" required /></Field><Field label="รายการ"><Select name="operation"><option value="add">เพิ่มเข้ากลุ่ม</option><option value="remove">นำออกจากกลุ่ม</option></Select></Field><Button type="submit" loading={busy} className="justify-self-start">บันทึกสมาชิก</Button></form></Card>
      </TabsContent>
      <TabsContent value="history" className="mt-5">
        <Card className="overflow-hidden"><Table><thead><tr><th>หลักสูตร</th><th>ผู้รับ</th><th>ความคืบหน้า</th><th>กำหนดเวลา</th><th>สถานะ</th><th /></tr></thead><tbody>{assignments.map((item) => <tr key={item.id}><td>{item.course_title}</td><td>{item.target_name}</td><td>{item.completed_count}/{item.recipient_count}</td><td>{item.due_at ? new Date(item.due_at).toLocaleString("th-TH") : "—"}</td><td><Badge variant={item.status === "active" ? "success" : "secondary"}>{item.status === "active" ? "ใช้งาน" : "ยกเลิก"}</Badge></td><td className="text-right">{item.status === "active" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void cancel(item.id)}><Ban className="h-4 w-4" /> ยกเลิก</Button>}</td></tr>)}</tbody></Table>{assignments.length === 0 && <p className="p-6 text-sm text-muted-foreground">ยังไม่มีรายการมอบหมาย</p>}</Card>
      </TabsContent>
    </Tabs>
  );
}
