import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, ForgotPasswordForm } from "@/components/auth/AuthForms";
import { isGoogleEnabled } from "@/server/auth/google";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน" };

export default async function ForgotPasswordPage() {
  const current = await getCurrentUser();
  if (current) redirect(current.isSystemOwner ? "/admin" : "/");
  return (
    <>
      <AuthHeading title="ลืมรหัสผ่าน" description="เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปที่อีเมลของคุณ" />
      <ForgotPasswordForm googleEnabled={await isGoogleEnabled()} />
    </>
  );
}
