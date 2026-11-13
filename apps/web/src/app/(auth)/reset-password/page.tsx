import type { Metadata } from "next";
import { Alert, Card, PageTitle } from "@/components/ui";
import { ResetPasswordForm } from "@/components/auth/AuthForms";

// The token is in the URL: never send it to other sites via Referer
export const metadata: Metadata = { title: "ตั้งรหัสผ่านใหม่", referrer: "no-referrer", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <Card>
      <PageTitle>ตั้งรหัสผ่านใหม่</PageTitle>
      {token && /^[A-Za-z0-9_-]{40,64}$/.test(token) ? <ResetPasswordForm token={token} /> : <Alert tone="error">ลิงก์ไม่ถูกต้อง</Alert>}
    </Card>
  );
}
