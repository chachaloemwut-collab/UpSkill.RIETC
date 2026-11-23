import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/account/ProfileForm";
import { AuthHeading } from "@/components/auth/AuthForms";
import { getCurrentUser } from "@/server/auth/session";
import { pendingGoogleSignup } from "@/server/auth/google-signup";

export default async function GoogleSignup() {
  if (await getCurrentUser()) redirect("/me");
  const pending = await pendingGoogleSignup();
  if (!pending) return <section><h1 className="font-semibold">กรุณายืนยันบัญชี Google อีกครั้ง</h1><Link href="/login" className="underline">กลับไปเข้าสู่ระบบ</Link></section>;
  return <>
    <AuthHeading title="กรอกข้อมูลเพื่อสมัครสมาชิก" description={`ยืนยันอีเมล ${pending.email} แล้ว กรุณากรอกเลขประจำตัวประชาชนและข้อมูลผู้เรียนก่อนสร้างบัญชี`} />
    <ProfileForm defaults={{}} exists={false} namesLocked={false} googleSignup />
  </>;
}
