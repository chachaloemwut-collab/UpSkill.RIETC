"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { THAI_PROVINCES } from "@upskill/core/profile";
import { Button, Dialog, Field, Input, Select, Alert, useToast } from "@/components/ui";
import { api } from "@/lib/api";

type Contact = { phone: string; addressLine: string; subdistrict: string; district: string; province: string; postalCode: string };
const labels = { phone: "โทรศัพท์", addressLine: "บ้านเลขที่ หมู่ ถนน", subdistrict: "ตำบล/แขวง", district: "อำเภอ/เขต", province: "จังหวัด", postalCode: "รหัสไปรษณีย์" } as const;
export function ContactEditor({ contact }: { contact: Contact }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const changed = Object.fromEntries((Object.keys(contact) as (keyof Contact)[]).filter(k => data.get(k) !== contact[k]).map(k => [k, data.get(k)]));
    if (!Object.keys(changed).length) { setOpen(false); return; }
    setBusy(true);
    try {
      const result = await api("/api/user/profile", { method: "PATCH", body: changed });
      if (!result.ok) { setError(result.message); return; }
      setOpen(false); router.refresh(); toast({ title: "บันทึกข้อมูลติดต่อแล้ว", variant: "success" });
    } finally { setBusy(false); }
  }
  return <><Button size="sm" variant="outline" onClick={() => { setError(""); setOpen(true); }}>แก้ไขข้อมูลติดต่อ</Button>
    <Dialog open={open} onOpenChange={setOpen} title="แก้ไขข้อมูลติดต่อ">{open && <form onSubmit={submit} className="grid gap-3">
      {error && <Alert title={error} variant="destructive"/>}
      {(Object.keys(labels) as (keyof Contact)[]).map(k => <Field key={k} label={labels[k]}>{k === "province" ?
        <Select name={k} defaultValue={contact[k]} required>{THAI_PROVINCES.map(p => <option key={p}>{p}</option>)}</Select> :
        <Input name={k} required defaultValue={contact[k]} type={k === "phone" ? "tel" : "text"} maxLength={k === "postalCode" ? 5 : k === "addressLine" ? 255 : k === "phone" ? 20 : 100} />}</Field>)}
      <Button type="submit" loading={busy}>บันทึกข้อมูลติดต่อ</Button>
    </form>}</Dialog></>;
}
