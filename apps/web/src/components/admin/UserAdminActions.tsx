"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, LogOut, Save } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Select, useToast } from "@/components/ui";
import { useConfirm } from "@/components/common/ConfirmProvider";

const ROLE_TH: Record<string, string> = { member: "ผู้เรียน", instructor: "ผู้สอน", admin: "ผู้ดูแลระบบ" };
const STATUS_TH: Record<string, string> = { active: "ใช้งาน", suspended: "ระงับชั่วคราว", banned: "ระงับถาวร" };

/**
 * Admin account actions on the user detail page: role/status, verify email, revoke sessions
 * (passwords: PasswordAdminPanel). Every action confirms first and reports success or the server's reason.
 */
export function UserAdminActions({ userId, currentRole, currentStatus, protectedUser, emailVerified }: { userId: string; currentRole: string; currentStatus: string; protectedUser: boolean; emailVerified: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [role, setRole] = useState(currentRole);
  const [status, setStatus] = useState(currentStatus);
  const [busy, setBusy] = useState<string | null>(null);

  async function save() {
    const changes = [
      role !== currentRole && `บทบาท ${ROLE_TH[currentRole] ?? currentRole} → ${ROLE_TH[role] ?? role}`,
      status !== currentStatus && `สถานะ ${STATUS_TH[currentStatus] ?? currentStatus} → ${STATUS_TH[status] ?? status}`,
    ].filter(Boolean);
    const ok = await confirm({
      title: "บันทึกการเปลี่ยนแปลงบัญชี?",
      description: `${changes.join(" · ")}\nผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์${status !== currentStatus ? " และได้รับอีเมลแจ้งสถานะบัญชี" : ""}`,
      confirmLabel: "บันทึก",
      destructive: status !== "active" || role === "admin",
    });
    if (!ok) return;
    setBusy("save");
    const r = await api(`/api/admin/users/${userId}`, { method: "PATCH", body: { role, status } });
    setBusy(null);
    if (!r.ok) {
      toast({ title: "บันทึกไม่สำเร็จ", description: r.message, variant: "destructive" });
      setRole(currentRole);
      setStatus(currentStatus);
      return;
    }
    toast({ title: "บันทึกแล้ว", variant: "success" });
    router.refresh();
  }

  async function run(key: string, path: string, title: string, description: string, done: string) {
    if (!(await confirm({ title, description, confirmLabel: "ยืนยัน" }))) return;
    setBusy(key);
    const r = await api(`/api/admin/users/${userId}/${path}`, { body: {} });
    setBusy(null);
    if (!r.ok) return toast({ title: "ทำรายการไม่สำเร็จ", description: r.message, variant: "destructive" });
    toast({ title: done, variant: "success" });
    router.refresh();
  }

  if (protectedUser) {
    return <p className="text-sm text-muted-foreground">บัญชีเจ้าของระบบได้รับการป้องกัน ไม่สามารถแก้ไขได้</p>;
  }

  const dirty = role !== currentRole || status !== currentStatus;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          บทบาท
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="h-10 w-40">
            <option value="member">ผู้เรียน</option>
            <option value="instructor">ผู้สอน</option>
            <option value="admin">ผู้ดูแลระบบ</option>
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          สถานะบัญชี
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-44">
            <option value="active">ใช้งาน</option>
            <option value="suspended">ระงับชั่วคราว</option>
            <option value="banned">ระงับถาวร</option>
          </Select>
        </label>
        <Button className="h-10" loading={busy === "save"} onClick={() => void save()} disabled={!dirty || !!busy}>
          <Save className="h-4 w-4" /> บันทึก
        </Button>
        {dirty && (
          <Button variant="ghost" className="h-10" onClick={() => { setRole(currentRole); setStatus(currentStatus); }}>
            ยกเลิกการแก้ไข
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {!emailVerified && (
          <Button
            variant="outline"
            size="sm"
            loading={busy === "verify"}
            disabled={!!busy}
            onClick={() => void run("verify", "verify-email", "ยืนยันอีเมลให้ผู้ใช้นี้?", "ใช้เมื่อสร้างบัญชีแทนผู้ใช้ หรือยืนยันตัวตนทางช่องทางอื่นแล้ว", "ยืนยันอีเมลแล้ว")}
          >
            <BadgeCheck className="h-4 w-4" /> ยืนยันอีเมลให้
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          loading={busy === "logout"}
          disabled={!!busy}
          onClick={() => void run("logout", "sessions/revoke", "ออกจากระบบทุกอุปกรณ์?", "ผู้ใช้ต้องเข้าสู่ระบบใหม่ในทุกอุปกรณ์", "ออกจากระบบทุกอุปกรณ์แล้ว")}
        >
          <LogOut className="h-4 w-4" /> ออกจากระบบทุกอุปกรณ์
        </Button>
      </div>
    </div>
  );
}
