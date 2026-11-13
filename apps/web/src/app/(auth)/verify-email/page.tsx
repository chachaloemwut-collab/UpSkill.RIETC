import type { Metadata } from "next";
import { Alert } from "@/components/ui";
import { AuthHeading, VerifyEmailButton } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "ยืนยันอีเมล", referrer: "no-referrer", robots: { index: false } };

// Requires a click (POST) instead of verifying on GET: email security scanners pre-open links
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <AuthHeading title="ยืนยันอีเมล" description="กดปุ่มด้านล่างเพื่อยืนยันว่าอีเมลนี้เป็นของคุณ" />
      {token && /^[A-Za-z0-9_-]{40,64}$/.test(token) ? (
        <VerifyEmailButton token={token} />
      ) : (
        <Alert variant="destructive" title="ลิงก์ไม่ถูกต้อง">ลิงก์อาจหมดอายุแล้ว ลองเข้าสู่ระบบเพื่อขอลิงก์ใหม่</Alert>
      )}
    </>
  );
}
