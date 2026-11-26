import { generateToken } from "@upskill/core";
import Link from "next/link";
import { RecoveryForms } from "./forms";
export const metadata = { title: "ขอความช่วยเหลือเพื่อกู้บัญชี", robots: { index: false } };
export const dynamic = "force-dynamic";
export default function RecoveryPage() {
  return <><h1 className="text-2xl font-semibold">ขอกู้บัญชีผู้เรียนเดิม</h1>
    <p className="mb-6 mt-2">หากยังเปิดอีเมลเดิมได้ ให้เลือก <Link className="underline" href="/forgot-password">ส่งลิงก์ตั้งรหัสผ่านทางอีเมลเดิม</Link> หากเข้าอีเมลไม่ได้ ให้แจ้งทะเบียนที่นี่เพื่อรักษาประวัติอบรมของคุณ</p>
    <RecoveryForms requestKey={generateToken()} /></>;
}
