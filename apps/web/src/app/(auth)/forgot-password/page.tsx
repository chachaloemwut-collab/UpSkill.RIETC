import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { ForgotPasswordForm } from "@/components/auth/AuthForms";
import { isGoogleEnabled } from "@/server/auth/google";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <PageTitle>ลืมรหัสผ่าน</PageTitle>
      <ForgotPasswordForm googleEnabled={isGoogleEnabled()} />
    </Card>
  );
}
