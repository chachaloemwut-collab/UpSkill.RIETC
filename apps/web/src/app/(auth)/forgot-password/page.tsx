import { emailRequestsAvailable } from "@/server/admin/email-settings.service";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, ForgotPasswordForm } from "@/components/auth/AuthForms";
import { isGoogleEnabled } from "@/server/auth/google";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const current = await getCurrentUser();
  const id = (await searchParams).id?.trim().slice(0, 254);
  const emailAvailable = await emailRequestsAvailable();
  return (
    <>
      <AuthHeading title="ลืมรหัสผ่าน" description="เลือกวิธีกลับเข้าสู่บัญชีเดิมเพื่อเรียนต่อ" />
      {current && <p className="mb-3">ขณะนี้คุณเข้าสู่ระบบอยู่ หากต้องการแก้รหัสผ่านของบัญชีนี้ <Link className="underline" href="/me">เปิดหน้าบัญชีของฉัน</Link> หรือดำเนินการด้านล่างเพื่อกู้บัญชีเดิม</p>}
      {!emailAvailable && <p role="status" className="mb-4 rounded border p-3">ขณะนี้ช่องทางอีเมลยังไม่พร้อมส่งลิงก์ กรุณาติดต่อผู้ดูแลระบบ</p>}
      <ForgotPasswordForm emailAvailable={emailAvailable} googleEnabled={await isGoogleEnabled()} initialIdentifier={id || undefined} />
    </>
  );
}
