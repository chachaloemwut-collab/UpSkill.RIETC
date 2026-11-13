import type { Metadata } from "next";
import { Alert } from "@/components/ui";
import { AuthHeading, ResetPasswordForm } from "@/components/auth/AuthForms";

// The token is in the URL: never send it to other sites via Referer
export const metadata: Metadata = { title: "ตั้งรหัสผ่านใหม่", referrer: "no-referrer", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <AuthHeading title="ตั้งรหัสผ่านใหม่" description="หลังตั้งรหัสผ่านใหม่ ทุกอุปกรณ์จะถูกออกจากระบบ" />
      {token && /^[A-Za-z0-9_-]{40,64}$/.test(token) ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert variant="destructive" title="ลิงก์ไม่ถูกต้อง">กรุณาขอลิงก์ใหม่จากหน้าลืมรหัสผ่าน</Alert>
      )}
    </>
  );
}
