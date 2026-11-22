import type { Metadata } from "next";
import { Alert } from "@/components/ui";
import { AuthHeading, ResetLinkExpired, ResetPasswordForm } from "@/components/auth/AuthForms";
import { inspectResetToken } from "@/server/auth/auth.service";

// The token is in the URL: never send it to other sites via Referer
export const metadata: Metadata = { title: "ตั้งรหัสผ่านใหม่", referrer: "no-referrer", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; required?: string }> }) {
  const { token, required } = await searchParams;
  const wellFormed = !!token && /^[A-Za-z0-9_-]{40,64}$/.test(token);
  // Checked up front (read-only) so an expired link says so before the user types a new password
  const valid = wellFormed && (await inspectResetToken(token)).valid;
  return (
    <>
      <AuthHeading title="ตั้งรหัสผ่านใหม่" description="หลังตั้งรหัสผ่านใหม่ ทุกอุปกรณ์จะถูกออกจากระบบ" />
      {required === "1" && valid && (
        <div className="mb-4">
          <Alert variant="warning" title="ต้องตั้งรหัสผ่านใหม่ก่อนใช้งาน">ผู้ดูแลระบบตั้งรหัสผ่านชั่วคราวให้บัญชีนี้ กรุณาตั้งรหัสผ่านของคุณเองภายใน 15 นาที แล้วเข้าสู่ระบบอีกครั้ง</Alert>
        </div>
      )}
      {valid && token ? <ResetPasswordForm token={token} /> : <ResetLinkExpired />}
    </>
  );
}
