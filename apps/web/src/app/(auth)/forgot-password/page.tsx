import type { Metadata } from "next";
import { AuthHeading, ForgotPasswordForm } from "@/components/auth/AuthForms";
import { isGoogleEnabled } from "@/server/auth/google";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="ลืมรหัสผ่าน" description="เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปที่อีเมลของคุณ" />
      <ForgotPasswordForm googleEnabled={isGoogleEnabled()} />
    </>
  );
}
