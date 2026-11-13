import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, PageTitle, formatDuration } from "@/components/ui";
import { CreateCourseForm } from "@/components/instructor/CreateCourseForm";
import { getCurrentUser } from "@/server/auth/session";
import { listMyCourses } from "@/server/courses/instructor.service";

export const metadata: Metadata = { title: "จัดการหลักสูตร" };

const VIS: Record<string, ["gray" | "green" | "amber" | "red", string]> = {
  draft: ["gray", "ฉบับร่าง"],
  published: ["green", "เผยแพร่"],
  unlisted: ["amber", "ไม่แสดงในรายการ"],
  suspended: ["red", "ถูกระงับ"],
};

export default async function InstructorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "instructor" && user.role !== "admin") redirect("/");
  const courses = await listMyCourses(user);
  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_360px]">
      <div>
        <PageTitle>หลักสูตรของฉัน</PageTitle>
        <Card flush>
          {courses.length === 0 ? (
            <p className="p-5 text-sm text-stone-600">ยังไม่มีหลักสูตร</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {courses.map((c) => {
                const [tone, label] = VIS[c.visibility] ?? ["gray", c.visibility];
                return (
                  <li key={c.id}>
                    <Link href={`/instructor/courses/${c.id}`} className="flex flex-wrap items-center gap-2 px-5 py-3 hover:bg-stone-50">
                      <span className="mr-auto font-medium">{c.title}</span>
                      {c.broken_count > 0 && <Badge tone="red">วิดีโอเสีย {c.broken_count}</Badge>}
                      <Badge tone={tone}>{label}</Badge>
                      <span className="text-xs text-stone-500">
                        {c.lesson_count} บท · {formatDuration(c.total_duration_sec)} · ผู้เรียน {c.enrollment_count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">สร้างหลักสูตรใหม่</h2>
        <CreateCourseForm />
      </Card>
    </main>
  );
}
