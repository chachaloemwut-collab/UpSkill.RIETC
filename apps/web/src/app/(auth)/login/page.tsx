import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, LoginForm } from "@/components/auth/AuthForms";
import { isGoogleEnabled } from "@/server/auth/google";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const current = await getCurrentUser();
  if (current) redirect(current.isSystemOwner ? "/admin" : "/");
  const { error } = await searchParams;
  return (
    <>
      <AuthHeading title="ยินดีต้อนรับกลับ" description="เข้าสู่ระบบเพื่อเรียนต่อจากที่ค้างไว้" />
      <LoginForm googleEnabled={await isGoogleEnabled()} initialError={error?.slice(0, 64)} />
    </>
  );
}
