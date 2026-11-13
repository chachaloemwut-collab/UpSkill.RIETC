import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, PageTitle } from "@/components/ui";
import { CourseAdminControls, RevokeCertificateForm, UserAdminForm } from "@/components/admin/AdminActions";
import { getCurrentUser } from "@/server/auth/session";
import { adminOverview } from "@/server/admin/admin.service";

export const metadata: Metadata = { title: "ผู้ดูแลระบบ", robots: { index: false } };

const REASONS: Record<string, string> = { POSITION_JUMP: "กรอข้าม/เร่งความเร็ว", POSITION_OUT_OF_RANGE: "ตำแหน่งเกินความยาวคลิป" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  const { courses, flags, topFlagged } = await adminOverview();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageTitle>ผู้ดูแลระบบ</PageTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">จัดการผู้ใช้</h2>
          <UserAdminForm />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">เพิกถอนใบรับรอง</h2>
          <RevokeCertificateForm />
        </Card>
      </div>

      <Card flush>
        <h2 className="border-b border-stone-100 px-5 py-3 font-semibold">หลักสูตรทั้งหมด</h2>
        <ul className="divide-y divide-stone-100">
          {courses.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
              <Link href={`/courses/${c.slug}`} className="mr-auto hover:underline">
                {c.title}
              </Link>
              <span className="text-xs text-stone-500">{c.instructor_email}</span>
              <Badge tone={c.visibility === "suspended" ? "red" : c.visibility === "published" ? "green" : "gray"}>{c.visibility}</Badge>
              {c.is_verified_course && <Badge tone="green">Verified</Badge>}
              <CourseAdminControls courseId={c.id} visibility={c.visibility} verified={c.is_verified_course} />
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card flush>
          <h2 className="border-b border-stone-100 px-5 py-3 font-semibold">พฤติกรรมผิดปกติล่าสุด</h2>
          {flags.length === 0 ? (
            <p className="px-5 py-4 text-sm text-stone-600">ไม่พบ</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {flags.map((f) => (
                <li key={String(f.id)} className="flex flex-wrap gap-x-3 px-5 py-2">
                  <span className="text-stone-500">{new Date(f.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</span>
                  <span>{f.email}</span>
                  <Badge tone="amber">{REASONS[f.reason] ?? f.reason}</Badge>
                  <span className="text-stone-600">{f.lesson_title}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">ผู้ใช้ที่ถูก flag บ่อย (30 วัน)</h2>
          <ul className="space-y-1 text-sm">
            {topFlagged.map((u) => (
              <li key={u.id} className="flex justify-between">
                <span className="truncate">{u.email}</span>
                <span className="font-medium">{u.n}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
