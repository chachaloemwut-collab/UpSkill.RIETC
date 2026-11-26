"use client";
import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import { categories } from "@/lib/recovery";
import { requestHelp, trackHelp } from "./actions";

export function RecoveryForms() {
  const [receipt, send, sending] = useActionState(requestHelp, { message: "" }, "/recovery");
  const [tracking, track, checking] = useActionState(trackHelp, { message: "" }, "/recovery");
  return <div className="grid gap-8">
    <section><h2 className="font-semibold">แจ้งงานทะเบียน</h2>
      {receipt.reference ? <div role="status" className="grid gap-2 rounded border p-3">
        <p>{receipt.message}</p><p>เลขเรื่อง <code className="break-all">{receipt.reference}</code></p>
        <p>รหัสติดตาม <code className="break-all">{receipt.secret}</code></p></div> :
        <form action={send} className="mt-3 grid gap-3">
          <label>ปัญหาที่พบ<select className="block w-full rounded border bg-background p-2" name="category" required>{Object.entries(categories).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>อีเมลหรือเบอร์โทรศัพท์ที่ติดต่อได้<Input name="contact" required maxLength={254} /></label>
          <p className="text-sm">ใช้ช่องทางนี้เพื่อนัดตรวจสอบตัวตน กรุณาเก็บรหัสผ่าน เลขบัตรประชาชน และรหัส OTP ไว้เป็นส่วนตัว</p>
          <Button type="submit" disabled={sending}>ส่งเรื่องให้ทะเบียน</Button><p role="status">{receipt.message}</p>
        </form>}
    </section>
    <section><h2 className="font-semibold">ติดตามเรื่องที่แจ้งไว้</h2>
      <form action={track} className="mt-3 grid gap-3">
        <label>เลขเรื่อง<Input name="reference" required maxLength={36} /></label>
        <label>รหัสติดตาม<Input type="password" name="secret" required autoComplete="off" maxLength={128} /></label>
        <Button type="submit" disabled={checking}>ตรวจสอบสถานะ</Button><p role="status">{tracking.message}</p>
      </form></section>
  </div>;
}
