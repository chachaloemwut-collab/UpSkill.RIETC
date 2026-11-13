import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { LoginForm } from "@/components/auth/AuthForms";
import { isGoogleEnabled } from "@/server/auth/google";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <Card>
      <PageTitle>เข้าสู่ระบบ</PageTitle>
      <LoginForm googleEnabled={isGoogleEnabled()} initialError={error?.slice(0, 64)} />
    </Card>
  );
}
