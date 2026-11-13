import type { Metadata } from "next";
import { Alert, Card, PageTitle } from "@/components/ui";
import { VerifyEmailButton } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "ยืนยันอีเมล", referrer: "no-referrer", robots: { index: false } };

// Requires a click (POST) instead of verifying on GET: email security scanners pre-open links
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <Card>
      <PageTitle>ยืนยันอีเมล</PageTitle>
      {token && /^[A-Za-z0-9_-]{40,64}$/.test(token) ? <VerifyEmailButton token={token} /> : <Alert tone="error">ลิงก์ไม่ถูกต้อง</Alert>}
    </Card>
  );
}
