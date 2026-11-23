import { emailRequestsAvailable } from "@/server/admin/email-settings.service";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, ForgotPasswordForm } from "@/components/auth/AuthForms";
import { isGoogleEnabled } from "@/server/auth/google";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const current = await getCurrentUser();
  // Signed-in users reset from account settings (ลืมรหัสผ่านปัจจุบัน) instead
  if (current) redirect(current.isSystemOwner ? "/admin" : "/me");
  const id = (await searchParams).id?.trim().slice(0, 254);
  return (
    <>
      <AuthHeading title="ลืมรหัสผ่าน" description="กรอกอีเมลหรือชื่อผู้ใช้ แล้วเราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลของบัญชี" />
      {!await emailRequestsAvailable() && <p role="status" className="mb-4 rounded border p-3">ขณะนี้ช่องทางอีเมลยังไม่พร้อมส่งลิงก์ กรุณาติดต่อผู้ดูแลระบบ</p>}
      <ForgotPasswordForm googleEnabled={await isGoogleEnabled()} initialIdentifier={id || undefined} />
    </>
  );
}
