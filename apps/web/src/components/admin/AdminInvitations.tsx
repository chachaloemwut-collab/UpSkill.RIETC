"use client";

import { useEffect, useState } from "react";
import { Copy, Send, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Textarea, useToast } from "@/components/ui";
import { formatDateTimeTh } from "@/lib/format";
import { useConfirm } from "@/components/common/ConfirmProvider";
import { api } from "@/lib/api";

interface Invitation {
  id: string;
  email: string;
  inviterName: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  message: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  link: string | null;
}

const STATUS_BADGE: Record<Invitation["status"], { label: string; variant: "secondary" | "success" | "warning" | "destructive" }> = {
  pending: { label: "รอดำเนินการ", variant: "warning" },
  accepted: { label: "ยอมรับแล้ว", variant: "success" },
  revoked: { label: "ยกเลิก", variant: "destructive" },
  expired: { label: "หมดอายุ", variant: "secondary" },
};

/** Invite people to teach: admin-only flow, no self-promotion path for regular users. */
export function AdminInvitations() {
  const [list, setList] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    fetch("/api/admin/instructor-invitations")
      .then((r) => r.json())
      .then((d: { invitations: Invitation[] }) => setList(d.invitations ?? []))
      .catch(() => setList([]));
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreatedLink(null);
    try {
      const res = await fetch("/api/admin/instructor-invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, message: message || undefined }),
      });
      const data = (await res.json()) as { error?: string; link?: string; email?: string };
      if (!res.ok) {
        setError(mapError(data.error));
        return;
      }
      setCreatedLink(data.link ?? null);
      setEmail("");
      setMessage("");
      toast({ title: `ส่งคำเชิญถึง ${data.email ?? ""} แล้ว`, variant: "success" });
      fetch("/api/admin/instructor-invitations")
        .then((r) => r.json())
        .then((d: { invitations: Invitation[] }) => setList(d.invitations ?? []))
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!(await confirm({ title: "ยกเลิกคำเชิญนี้?", destructive: true }))) return;
    const r = await api(`/api/admin/instructor-invitations/${id}/revoke`, { body: {} });
    if (!r.ok) {
      toast({ title: "ยกเลิกคำเชิญไม่สำเร็จ", description: r.message, variant: "destructive" });
      return;
    }
    toast({ title: "ยกเลิกคำเชิญแล้ว", variant: "success" });
    fetch("/api/admin/instructor-invitations")
      .then((r) => r.json())
      .then((d: { invitations: Invitation[] }) => setList(d.invitations ?? []))
      .catch(() => undefined);
  }

  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <h3 className="mb-1 font-semibold">เชิญผู้สอนด้วยอีเมล</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          ผู้ใช้ทั่วไปไม่มีช่องทางเลื่อนตนเองเป็นผู้สอน — มีเพียงคำเชิญจากผู้ดูแลระบบเท่านั้น ใช้ได้ครั้งเดียว หมดอายุใน 7 วัน
        </p>
        <form onSubmit={(e) => void invite(e)} className="grid gap-3">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="อีเมลผู้ที่ต้องการเชิญ (เช่น teacher@example.com)" />
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="ข้อความถึงผู้ได้รับเชิญ (ไม่บังคับ)" rows={2} />
          <div>
            <Button type="submit" loading={busy}>
              <Send className="h-4 w-4" /> ส่งคำเชิญ
            </Button>
          </div>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
        {createdLink && (
          <div className="mt-3 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
            <p className="font-semibold text-success">สร้างคำเชิญแล้ว — ส่งลิงก์นี้ให้ผู้ได้รับเชิญ (อีเมลอาจยังไปไม่ถึงถ้ายังไม่ตั้ง SMTP)</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-background px-2 py-1 text-xs">{createdLink}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(createdLink);
                  toast({ title: "คัดลอกลิงก์แล้ว" });
                }}
              >
                <Copy className="h-4 w-4" /> คัดลอก
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b px-5 py-3 font-semibold">คำเชิญล่าสุด</div>
        {list.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">ยังไม่มีคำเชิญ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mobile-records min-w-[640px] w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2">อีเมล</th>
                  <th className="px-5 py-2">เชิญโดย</th>
                  <th className="px-5 py-2">สถานะ</th>
                  <th className="px-5 py-2">หมดอายุ</th>
                  <th className="px-5 py-2 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {list.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td data-label="อีเมล" className="px-5 py-2.5 font-medium">{inv.email}</td>
                    <td data-label="เชิญโดย" className="px-5 py-2.5 text-muted-foreground">{inv.inviterName}</td>
                    <td data-label="สถานะ" className="px-5 py-2.5">
                      <Badge variant={STATUS_BADGE[inv.status].variant}>{STATUS_BADGE[inv.status].label}</Badge>
                    </td>
                    <td data-label="หมดอายุ" className="px-5 py-2.5 text-xs text-muted-foreground">{formatDateTimeTh(inv.expiresAt)}</td>
                    <td data-label="ดำเนินการ" className="px-5 py-2.5 text-right">
                      {inv.status === "pending" ? (
                        <Button variant="outline" size="sm" onClick={() => void revoke(inv.id)}>
                          <Trash2 className="h-4 w-4" /> ยกเลิก
                        </Button>
                      ) : inv.link ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function mapError(code?: string): string {
  switch (code) {
    case "ALREADY_INSTRUCTOR": return "ผู้ใช้นี้เป็นผู้สอนอยู่แล้ว";
    case "USER_NOT_ACTIVE": return "บัญชีนี้ถูกระงับหรือลบไปแล้ว";
    case "INVITE_ALREADY_PENDING": return "มีคำเชิญที่ยังไม่หมดอายุสำหรับอีเมลนี้อยู่แล้ว";
    case "INVALID_EMAIL": return "รูปแบบอีเมลไม่ถูกต้อง";
    default: return "ไม่สามารถส่งคำเชิญได้";
  }
}
