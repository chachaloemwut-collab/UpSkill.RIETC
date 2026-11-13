import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Badge, Card, PageTitle } from "@/components/ui";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { LockLegalNameForm } from "@/components/course/CertificatePanel";
import { ctx } from "@/server/context";
import { isGoogleEnabled } from "@/server/auth/google";
import { getCurrentUser } from "@/server/auth/session";
import { myEnrollments } from "@/server/courses/courses.service";

export const metadata: Metadata = { title: "บัญชีของฉัน" };

const STATUS: Record<string, string> = { in_progress: "กำลังเรียน", completed: "เรียนจบแล้ว", revoked: "ถูกเพิกถอน" };

export default async function MePage({ searchParams }: { searchParams: Promise<{ linked?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { linked } = await searchParams;
  const { db } = ctx();
  const me = await db
    .selectFrom("users")
    .select(["email", "role", "legal_full_name_th", "legal_full_name_en", "legal_name_locked_at", "password_hash"])
    .where("id", "=", user.id)
    .executeTakeFirstOrThrow();
  const google = await db.selectFrom("user_oauth_accounts").select(["provider_email"]).where("user_id", "=", user.id).where("provider", "=", "google").executeTakeFirst();
  const enrollments = await myEnrollments(user.id);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <PageTitle sub={me.email}>บัญชีของฉัน</PageTitle>
      {linked === "google" && <Alert tone="success">ผูกบัญชี Google เรียบร้อยแล้ว</Alert>}

      <Card>
        <h2 className="mb-3 font-semibold">หลักสูตรของฉัน</h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-stone-600">
            ยังไม่ได้ลงทะเบียนเรียน{" "}
            <Link href="/" className="text-green-700 underline">
              ดูหลักสูตรทั้งหมด
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {enrollments.map((e) => (
              <li key={e.slug} className="flex flex-wrap items-center gap-2 py-2">
                <Link href={`/courses/${e.slug}`} className="mr-auto text-stone-900 hover:underline">
                  {e.title}
                </Link>
                <Badge tone={e.status === "completed" ? "green" : "gray"}>{STATUS[e.status] ?? e.status}</Badge>
                {e.certificate_code &&
                  (e.revoked_at ? (
                    <Badge tone="red">ใบรับรองถูกเพิกถอน</Badge>
                  ) : (
                    <Link href={`/verify/${e.certificate_code}`} className="text-sm text-green-700 underline">
                      {e.certificate_code}
                    </Link>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {me.legal_name_locked_at ? (
        <Card>
          <h2 className="mb-2 font-semibold">ชื่อบนใบรับรอง</h2>
          <p className="text-stone-800">{me.legal_full_name_th}</p>
          <p className="text-stone-800">{me.legal_full_name_en}</p>
          <p className="mt-2 text-xs text-stone-500">ล็อกแล้ว ไม่สามารถแก้ไขได้ หากชื่อผิดพลาด กรุณาติดต่อผู้ดูแลระบบ</p>
        </Card>
      ) : (
        <LockLegalNameForm />
      )}

      <Card>
        <h2 className="mb-3 font-semibold">{me.password_hash ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่าน"}</h2>
        {!me.password_hash && <p className="mb-3 text-sm text-stone-600">บัญชีนี้เข้าสู่ระบบด้วย Google ตั้งรหัสผ่านเพื่อเข้าสู่ระบบด้วยอีเมลได้ด้วย</p>}
        <ChangePasswordForm hasPassword={!!me.password_hash} />
      </Card>

      {isGoogleEnabled() && (
        <Card>
          <h2 className="mb-2 font-semibold">บัญชี Google</h2>
          {google ? (
            <p className="text-sm text-stone-700">ผูกกับ {google.provider_email} แล้ว</p>
          ) : (
            <a href="/api/auth/google?mode=link" className="inline-block rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50">
              ผูกบัญชี Google
            </a>
          )}
        </Card>
      )}
    </main>
  );
}
