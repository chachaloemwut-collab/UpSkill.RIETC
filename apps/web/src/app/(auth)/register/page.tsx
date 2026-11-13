import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, RegisterForm } from "@/components/auth/AuthForms";
import { isGoogleEnabled } from "@/server/auth/google";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "สมัครสมาชิก" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <>
      <AuthHeading title="สร้างบัญชีใหม่" description="สมัครสมาชิกเพื่อเข้าถึงหลักสูตรและติดตามผลการเรียน" />
      <RegisterForm googleEnabled={await isGoogleEnabled()} />
    </>
  );
}
