import Link from "next/link";
import { Badge, Card, PageTitle, formatDuration } from "@/components/ui";
import { listPublishedCourses } from "@/server/courses/courses.service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const courses = await listPublishedCourses();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageTitle sub="เรียนจากวิดีโอ YouTube บันทึกเวลาเรียนจริง และรับใบรับรองที่ตรวจสอบได้ด้วย QR Code">หลักสูตรทั้งหมด</PageTitle>
      {courses.length === 0 ? (
        <Card>
          <p className="text-stone-600">ยังไม่มีหลักสูตรที่เผยแพร่</p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <li key={c.id}>
              <Link href={`/courses/${c.slug}`} className="block h-full">
                <Card className="h-full transition-shadow hover:shadow-md">
                  <div className="mb-2 flex flex-wrap gap-2">
                    {c.is_verified_course ? <Badge tone="green">Verified Course</Badge> : <Badge>Community Course</Badge>}
                  </div>
                  <h2 className="font-semibold text-stone-900">{c.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-stone-600">{c.description}</p>
                  <p className="mt-3 text-xs text-stone-500">
                    {c.instructor_name} · {c.lesson_count} บท · {formatDuration(c.total_duration_sec)}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
