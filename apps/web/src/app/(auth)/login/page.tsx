import { learnerReturn } from "@/lib/learner-return";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, LoginForm } from "@/components/auth/AuthForms";
import { isGoogleEnabled } from "@/server/auth/google";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string; next?:string }> }) {
  const { error, reset, next } = await searchParams;
  const returnTo = learnerReturn(next);
  const current = await getCurrentUser();
  if (current) redirect(current.isSystemOwner ? "/admin" : returnTo ?? "/");
  return (
    <>
      <AuthHeading title="ยินดีต้อนรับกลับ" description="เข้าสู่ระบบเพื่อเรียนต่อจากที่ค้างไว้" />
      <LoginForm
        googleEnabled={await isGoogleEnabled()}
        returnTo={returnTo}
        initialError={error?.slice(0, 64)}
        notice={reset === "1" ? "ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย" : undefined}
      />
    </>
  );
}
