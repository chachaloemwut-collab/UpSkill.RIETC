"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Mail, Plus, Star, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Input, useToast } from "@/components/ui";
import { api } from "@/lib/api";

export interface UserEmailItem {
  id: string;
  email: string;
  is_primary: boolean;
  verified_at: string | Date | null;
  created_at: string | Date;
}

export function UserEmailsManager({ initialEmails }: { initialEmails: UserEmailItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [emails, setEmails] = useState<UserEmailItem[]>(initialEmails);
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const res = await api<{ emails: UserEmailItem[] }>("/api/user/emails");
    if (res.ok) {
      setEmails(res.data.emails);
      router.refresh();
    }
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ email: UserEmailItem }>("/api/user/emails", {
        body: { email: newEmail.trim() },
      });
      if (res.ok) {
        setNewEmail("");
        toast({
          title: "เพิ่มอีเมลสำเร็จ",
          description: "ระบบได้ส่งลิงก์ยืนยันไปยังอีเมลใหม่แล้ว กรุณากดยืนยันก่อนตั้งเป็นอีเมลหลัก",
          variant: "success",
        });
        await reload();
      } else {
        setError(res.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSetPrimary = async (id: string, email: string) => {
    setActionId(id);
    setError(null);
    try {
      const res = await api(`/api/user/emails/${id}/primary`, { method: "POST" });
      if (res.ok) {
        toast({
          title: "เปลี่ยนอีเมลหลักสำเร็จ",
          description: `กำหนด ${email} เป็นอีเมลหลักของบัญชีเรียบร้อยแล้ว`,
          variant: "success",
        });
        await reload();
      } else {
        setError(res.message);
      }
    } finally {
      setActionId(null);
    }
  };

  const handleResend = async (id: string) => {
    setActionId(id);
    setError(null);
    try {
      const res = await api(`/api/user/emails/${id}/resend`, { method: "POST" });
      if (res.ok) {
        toast({
          title: "ส่งลิงก์ยืนยันแล้ว",
          description: "กรุณาตรวจสอบกล่องจดหมายของคุณ",
          variant: "success",
        });
      } else {
        setError(res.message);
      }
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (emails.length <= 1) {
      toast({
        title: "ไม่สามารถลบอีเมลได้",
        description: "ระบบกำหนดให้ต้องมีอีเมลอย่างน้อยหนึ่งอีเมลในบัญชีเสมอ",
        variant: "destructive",
      });
      return;
    }
    if (!window.confirm(`ยืนยันการลบอีเมล ${email} ออกจากบัญชีหรือไม่?`)) return;
    setActionId(id);
    setError(null);
    try {
      const res = await api(`/api/user/emails/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({
          title: "ลบอีเมลสำเร็จ",
          description: `ลบ ${email} ออกจากบัญชีเรียบร้อยแล้ว`,
          variant: "success",
        });
        await reload();
      } else {
        setError(res.message);
      }
    } finally {
      setActionId(null);
    }
  };

  return (
    <Card className="grid gap-5 p-6">
      {error && <Alert variant="destructive" title={error} />}

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs sm:text-sm text-foreground/90 flex items-start gap-3">
        <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-primary">กฎความปลอดภัยด้านอีเมลของระบบ</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            บัญชีของคุณต้องมีอีเมลในระบบอย่างน้อยหนึ่งอีเมลเสมอ คุณสามารถเพิ่มอีเมลสถานศึกษาหรืออีเมลส่วนตัวเพื่อความยืดหยุ่นในการเข้าสู่ระบบและการกู้คืนบัญชี
          </p>
        </div>
      </div>

      {/* List of current emails */}
      <div className="divide-y divide-border/60 rounded-lg border">
        {emails.map((item) => {
          const isVerified = Boolean(item.verified_at);
          const isWorking = actionId === item.id;
          return (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/30"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm sm:text-base break-all">{item.email}</span>
                  {item.is_primary && (
                    <Badge variant="success" className="gap-1 text-[11px] font-semibold">
                      <Star className="h-3 w-3 fill-current" /> อีเมลหลัก
                    </Badge>
                  )}
                  {isVerified ? (
                    <Badge variant="outline" className="gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> ยืนยันแล้ว
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="gap-1 text-[11px]">
                      <Clock className="h-3 w-3" /> รอยืนยัน
                    </Badge>
                  )}
                </div>
                {!isVerified && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    ยังไม่ได้กดยืนยันผ่านลิงก์ในอีเมล ไม่สามารถตั้งเป็นอีเมลหลักได้
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0">
                {!item.is_primary && isVerified && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={isWorking}
                    onClick={() => handleSetPrimary(item.id, item.email)}
                    className="text-xs"
                  >
                    ตั้งเป็นอีเมลหลัก
                  </Button>
                )}
                {!isVerified && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={isWorking}
                    onClick={() => handleResend(item.id)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ส่งลิงก์ยืนยันอีกครั้ง
                  </Button>
                )}
                {!item.is_primary && emails.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={isWorking}
                    onClick={() => handleDelete(item.id, item.email)}
                    className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    title="ลบอีเมลนี้"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add New Email Form */}
      <form onSubmit={handleAddEmail} className="mt-2 flex flex-col sm:flex-row items-end gap-3 pt-3 border-t">
        <div className="w-full flex-1">
          <Field label="เพิ่มอีเมลเพิ่มเติม" hint="เช่น อีเมลสถานศึกษา (@vec.mail.go.th) หรืออีเมลส่วนตัว">
            <Input
              type="email"
              name="new_email"
              autoComplete="email"
              placeholder="example@rietc.ac.th"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              className="h-10"
            />
          </Field>
        </div>
        <Button type="submit" size="md" loading={busy} className="w-full sm:w-auto shrink-0 mb-1">
          <Plus className="h-4 w-4" /> เพิ่มอีเมล
        </Button>
      </form>
    </Card>
  );
}
