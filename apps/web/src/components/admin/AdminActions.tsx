"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Alert, Button, Field, Input } from "@/components/ui";

function useMsg() {
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return { msg, setMsg, banner: msg && <Alert tone={msg.tone}>{msg.text}</Alert> };
}

export function CourseAdminControls({ courseId, visibility, verified }: { courseId: string; visibility: string; verified: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await api(`/api/admin/courses/${courseId}`, { method: "PATCH", body });
    setBusy(false);
    if (r.ok) router.refresh();
    else alert(r.message);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy} onClick={() => patch({ is_verified_course: !verified })}>
        {verified ? "ยกเลิก Verified" : "รับรอง (Verified)"}
      </Button>
      {visibility === "suspended" ? (
        <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy} onClick={() => patch({ visibility: "draft" })}>
          ยกเลิกการระงับ
        </Button>
      ) : (
        <Button variant="danger" className="px-2 py-1 text-xs" disabled={busy} onClick={() => confirm("ระงับหลักสูตรนี้?") && patch({ visibility: "suspended" })}>
          ระงับ
        </Button>
      )}
    </div>
  );
}

export function RevokeCertificateForm() {
  const m = useMsg();
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (!confirm("เพิกถอนใบรับรองนี้? (ย้อนกลับไม่ได้)")) return;
    setBusy(true);
    const r = await api(`/api/admin/certificates/${encodeURIComponent(String(f.get("code")))}/revoke`, { body: { reason: f.get("reason") } });
    setBusy(false);
    if (r.ok) {
      form.reset();
      m.setMsg({ tone: "success", text: "เพิกถอนแล้ว" });
    } else m.setMsg({ tone: "error", text: r.message });
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {m.banner}
      <Field label="รหัสใบรับรอง">
        <Input name="code" required placeholder="CERT-2026-XXXX-XXXX-XXXX" />
      </Field>
      <Field label="เหตุผล (แสดงบนหน้าตรวจสอบสาธารณะ)">
        <Input name="reason" required minLength={5} maxLength={1000} />
      </Field>
      <Button type="submit" variant="danger" disabled={busy}>
        เพิกถอน
      </Button>
    </form>
  );
}

export function UserAdminForm() {
  const m = useMsg();
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await api("/api/admin/users", {
      method: "PATCH",
      body: { email: f.get("email"), ...(f.get("role") ? { role: f.get("role") } : {}), ...(f.get("status") ? { status: f.get("status") } : {}) },
    });
    setBusy(false);
    m.setMsg(r.ok ? { tone: "success", text: "อัปเดตผู้ใช้แล้ว (ผู้ใช้ถูกออกจากระบบทุกอุปกรณ์)" } : { tone: "error", text: r.message });
  }
  const select = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5";
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {m.banner}
      <Field label="อีเมลผู้ใช้">
        <Input name="email" type="email" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="บทบาท">
          <select name="role" className={select} defaultValue="">
            <option value="">(ไม่เปลี่ยน)</option>
            <option value="member">member</option>
            <option value="instructor">instructor</option>
            <option value="admin">admin</option>
          </select>
        </Field>
        <Field label="สถานะ">
          <select name="status" className={select} defaultValue="">
            <option value="">(ไม่เปลี่ยน)</option>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="banned">banned</option>
          </select>
        </Field>
      </div>
      <Button type="submit" disabled={busy}>
        บันทึก
      </Button>
    </form>
  );
}
