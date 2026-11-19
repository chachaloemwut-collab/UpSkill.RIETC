import type { Metadata } from "next";
import { Alert } from "@/components/ui";
import { AuthHeading, ResetPasswordForm } from "@/components/auth/AuthForms";

// The token is in the URL: never send it to other sites via Referer
export const metadata: Metadata = { title: "ตั้งรหัสผ่านใหม่", referrer: "no-referrer", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; required?: string }> }) {
  const { token, required } = await searchParams;
  return (
    <>
      <AuthHeading title="ตั้งรหัสผ่านใหม่" description="หลังตั้งรหัสผ่านใหม่ ทุกอุปกรณ์จะถูกออกจากระบบ" />
      {required === "1" && (
        <div className="mb-4">
          <Alert variant="warning" title="ต้องตั้งรหัสผ่านใหม่ก่อนใช้งาน">ผู้ดูแลระบบตั้งรหัสผ่านชั่วคราวให้บัญชีนี้ กรุณาตั้งรหัสผ่านของคุณเองภายใน 15 นาที แล้วเข้าสู่ระบบอีกครั้ง</Alert>
        </div>
      )}
      {token && /^[A-Za-z0-9_-]{40,64}$/.test(token) ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert variant="destructive" title="ลิงก์ไม่ถูกต้อง">กรุณาขอลิงก์ใหม่จากหน้าลืมรหัสผ่าน หรือติดต่อผู้ดูแลระบบ</Alert>
      )}
    </>
  );
}
