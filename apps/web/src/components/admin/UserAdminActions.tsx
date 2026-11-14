"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogOut, Save } from "lucide-react";
import { Button, Select } from "@/components/ui";

/** Admin account actions on the user detail page: role/status, force password reset, revoke sessions. */
export function UserAdminActions({ userId, currentRole, currentStatus, protectedUser }: { userId: string; currentRole: string; currentStatus: string; protectedUser: boolean }) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [status, setStatus] = useState(currentStatus);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await fetch(`/api/admin/users/${userId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role, status }) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function run(path: string, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/users/${userId}/${path}`, { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (protectedUser) {
    return <p className="text-sm text-muted-foreground">บัญชีเจ้าของระบบได้รับการป้องกัน ไม่สามารถแก้ไขได้</p>;
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-40">
          <option value="member">ผู้เรียน</option>
          <option value="instructor">ผู้สอน</option>
          <option value="admin">ผู้ดูแลระบบ</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
          <option value="active">ใช้งาน</option>
          <option value="suspended">ระงับชั่วคราว</option>
          <option value="banned">ระงับถาวร</option>
        </Select>
        <Button size="sm" loading={busy} onClick={save} disabled={role === currentRole && status === currentStatus}>
          <Save className="h-4 w-4" /> บันทึก (บังคับออกจากระบบ)
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" loading={busy} onClick={() => void run("reset-password", "ส่งอีเมลตั้งรหัสผ่านใหม่ให้ผู้ใช้คนนี้? ผู้ใช้จะถูกออกจากระบบ")}>
          <KeyRound className="h-4 w-4" /> บังคับตั้งรหัสผ่านใหม่
        </Button>
        <Button variant="outline" size="sm" loading={busy} onClick={() => void run("sessions/revoke", "บังคับออกจากระบบทุกอุปกรณ์ของผู้ใช้คนนี้?")}>
          <LogOut className="h-4 w-4" /> ออกจากระบบทุกอุปกรณ์
        </Button>
      </div>
    </div>
  );
}
