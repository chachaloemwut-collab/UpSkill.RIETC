import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { RegisterForm } from "@/components/auth/AuthForms";
import { isGoogleEnabled } from "@/server/auth/google";

export const metadata: Metadata = { title: "สมัครสมาชิก" };

export default function RegisterPage() {
  return (
    <Card>
      <PageTitle sub="เรียนฟรี หรือสร้างหลักสูตรของคุณเอง">สมัครสมาชิก</PageTitle>
      <RegisterForm googleEnabled={isGoogleEnabled()} />
      <p className="mt-4 text-sm text-stone-600">
        มีบัญชีแล้ว?{" "}
        <Link href="/login" className="text-green-700 underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </Card>
  );
}
