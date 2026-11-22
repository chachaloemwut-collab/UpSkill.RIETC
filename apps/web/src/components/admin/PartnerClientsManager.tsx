"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, KeyRound, Plus, ShieldOff } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTimeTh } from "@/lib/format";
import { Alert, Badge, Button, Card, Dialog, Field, Input, Textarea, useToast } from "@/components/ui";
import { useConfirm } from "@/components/common/ConfirmProvider";

export interface PartnerClientRow {
  id: string;
  name: string;
  purpose: string;
  key_prefix: string;
  allowed_ips: string[];
  created_at: string | Date;
  expires_at: string | Date;
  revoked_at: string | Date | null;
  last_used_at: string | Date | null;
}

const state = (c: PartnerClientRow) =>
  c.revoked_at ? (["destructive", "เพิกถอนแล้ว"] as const) : new Date(c.expires_at).getTime() <= Date.now() ? (["warning", "หมดอายุ"] as const) : (["success", "ใช้งานได้"] as const);

/** API keys for other agencies' systems (docs/PARTNER_API.md): create (key shown once) and revoke. */
export function PartnerClientsManager({ clients }: { clients: PartnerClientRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", purpose: "", ips: "", days: "180" });
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const r = await api<{ key: string }>("/api/admin/partner-clients", {
      body: { name: form.name, purpose: form.purpose, allowedIps: form.ips.split(/[\s,]+/).filter(Boolean), days: Number(form.days) || 0 },
    });
    setBusy(false);
    if (!r.ok) return setError(r.code === "VALIDATION_FAILED" ? "กรอกชื่อระบบ วัตถุประสงค์ (อย่างน้อย 10 ตัวอักษร) IP และอายุกุญแจ 1–365 วัน" : r.message);
    setOpen(false);
    setNewKey({ name: form.name, key: r.data.key });
    setForm({ name: "", purpose: "", ips: "", days: "180" });
    router.refresh();
  }

  async function revoke(c: PartnerClientRow) {
    const ok = await confirm({
      title: `เพิกถอนกุญแจของ “${c.name}”?`,
      description: "ระบบนั้นจะเรียก API ไม่ได้ทันทีตั้งแต่คำขอถัดไป และเปิดใช้กุญแจนี้อีกไม่ได้ ต้องสร้างกุญแจใหม่",
      confirmLabel: "เพิกถอน",
      destructive: true,
    });
    if (!ok) return;
    const r = await api(`/api/admin/partner-clients/${c.id}/revoke`, { body: {} });
    if (!r.ok) return toast({ title: "เพิกถอนไม่สำเร็จ", description: r.message, variant: "destructive" });
    toast({ title: "เพิกถอนกุญแจแล้ว", variant: "success" });
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl text-sm text-muted-foreground">
          ให้ระบบของหน่วยงานอื่นตรวจผลการอบรมด้วยเลขประจำตัวประชาชนที่เขามีอยู่แล้ว ระบบตอบเฉพาะหลักสูตรที่เรียนจบและวุฒิบัตร ไม่ส่งเลขบัตร อีเมล เบอร์โทร หรือที่อยู่ออกไป
          ทุกกุญแจต้องกำหนด IP ที่อนุญาตและวันหมดอายุ และทุกคำขอถูกบันทึก คู่มือสำหรับนักพัฒนา: <span className="font-mono">docs/PARTNER_API.md</span>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> สร้างกุญแจ API
        </Button>
      </div>

      {newKey && (
        <Alert variant="warning" title={`กุญแจของ “${newKey.name}” แสดงครั้งเดียวเท่านั้น`}>
          <p className="mb-2">คัดลอกแล้วส่งให้ผู้ดูแลระบบปลายทางผ่านช่องทางที่ปลอดภัย (ห้ามส่งในกลุ่มแชตหรืออีเมลที่ไม่เข้ารหัส) ระบบเก็บไว้เฉพาะค่า hash จึงแสดงซ้ำไม่ได้</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 break-all rounded bg-background px-2 py-1 font-mono text-xs">{newKey.key}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(newKey.key).then(() => toast({ title: "คัดลอกกุญแจแล้ว", variant: "success" }));
              }}
            >
              <Copy className="h-4 w-4" /> คัดลอก
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>ซ่อน</Button>
          </div>
        </Alert>
      )}

      {clients.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีระบบภายนอกที่ได้รับกุญแจ</Card>
      ) : (
        <div className="grid gap-3">
          {clients.map((c) => {
            const [variant, label] = state(c);
            return (
              <Card key={c.id} className="grid gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-muted-foreground" /> {c.name}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={variant}>{label}</Badge>
                    {!c.revoked_at && (
                      <Button size="sm" variant="outline" onClick={() => void revoke(c)}>
                        <ShieldOff className="h-4 w-4" /> เพิกถอน
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{c.purpose}</p>
                <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>รหัสกุญแจ <span className="font-mono text-foreground">upk_{c.key_prefix}_…</span></div>
                  <div>IP ที่อนุญาต <span className="font-mono text-foreground">{c.allowed_ips.join(", ")}</span></div>
                  <div>สร้างเมื่อ {formatDateTimeTh(c.created_at)} · หมดอายุ {formatDateTimeTh(c.expires_at)}</div>
                  <div>ใช้ล่าสุด {c.last_used_at ? formatDateTimeTh(c.last_used_at) : "ยังไม่เคยใช้"}</div>
                </dl>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="สร้างกุญแจ API สำหรับระบบภายนอก"
        description="ระบบปลายทางต้องเรียกจาก IP ที่กำหนดเท่านั้น และกุญแจหมดอายุตามวันที่ตั้ง"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>ยกเลิก</Button>
            <Button onClick={() => void create()} loading={busy}>สร้างกุญแจ</Button>
          </div>
        }
      >
        <div className="grid gap-3 py-1">
          {error && <Alert variant="destructive" title={error} />}
          <Field label="ชื่อระบบ / หน่วยงาน">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="เช่น ระบบทะเบียน วิทยาลัยเทคนิคระยอง" maxLength={200} />
          </Field>
          <Field label="วัตถุประสงค์การใช้ข้อมูล" hint="บันทึกไว้เป็นหลักฐานตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล">
            <Textarea value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} rows={3} placeholder="เช่น ตรวจสอบผลการอบรมของผู้สมัครประกวดก่อนรับผลงาน" />
          </Field>
          <Field label="IP ที่อนุญาต" hint="IP ของเซิร์ฟเวอร์ปลายทาง คั่นด้วยเว้นวรรคหรือจุลภาค ใช้ช่วง IPv4 แบบ CIDR ได้ เช่น 203.0.113.0/24">
            <Input value={form.ips} onChange={(e) => setForm((f) => ({ ...f, ips: e.target.value }))} placeholder="203.0.113.10" />
          </Field>
          <Field label="อายุกุญแจ (วัน)">
            <Input type="number" min={1} max={365} value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
