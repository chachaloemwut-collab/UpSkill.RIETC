import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, formatDuration } from "@/components/ui";
import { EnrollButton } from "@/components/course/EnrollButton";
import { LessonList } from "@/components/course/LessonList";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCourseForViewer(slug, null);
  return data ? { title: data.course.title, description: data.course.description ?? undefined } : {};
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const data = await getCourseForViewer(slug, user);
  if (!data) notFound();
  const { course, enrollment, lessons, allLessonsCompleted, certificate, manager } = data;
  const next = lessons.find((l) => l.unlocked && !l.completed && !l.broken);
  const enrolled = !!enrollment && enrollment.status !== "revoked";

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card>
          <div className="mb-2 flex flex-wrap gap-2">
            {course.is_verified_course ? <Badge tone="green">Verified Course</Badge> : <Badge>Community Course</Badge>}
            {course.visibility !== "published" && <Badge tone="amber">{course.visibility}</Badge>}
          </div>
          <h1 className="text-2xl font-bold">{course.title}</h1>
          <p className="mt-1 text-sm text-stone-600">
            โดย {course.instructor_name} · {lessons.length} บท · {formatDuration(course.total_duration_sec)}
          </p>
          {course.description && <p className="mt-4 whitespace-pre-line text-stone-700">{course.description}</p>}
          {manager && (
            <Link href={`/instructor/courses/${course.id}`} className="mt-4 inline-block text-sm text-green-700 underline">
              จัดการหลักสูตรนี้
            </Link>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">เกณฑ์การผ่านหลักสูตร</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-stone-700">
            <li>ดูวิดีโอแต่ละบทอย่างน้อย {course.min_watch_percentage}% (ระบบนับเวลาจริง ไม่สามารถกรอข้ามหรือเร่งความเร็วได้)</li>
            {course.is_sequential_locked && <li>ต้องเรียนตามลำดับบท</li>}
            <li>
              สอบผ่านอย่างน้อย {course.passing_quiz_score}% (สอบได้ {course.max_quiz_attempts_per_day} ครั้ง/วัน, เวลา {Math.round(course.quiz_time_limit_sec / 60)} นาที)
            </li>
          </ul>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card>
          {!enrolled ? (
            <EnrollButton courseId={course.id} loggedIn={!!user} />
          ) : enrollment?.status === "completed" ? (
            <div className="space-y-3">
              <Alert tone="success">คุณเรียนจบและสอบผ่านหลักสูตรนี้แล้ว 🎉</Alert>
              <Link href={`/courses/${course.slug}/certificate`} className="block rounded-lg bg-green-700 px-4 py-2.5 text-center text-sm font-medium text-white">
                {certificate ? "ดูใบรับรอง" : "รับใบรับรอง"}
              </Link>
            </div>
          ) : allLessonsCompleted ? (
            <Link href={`/courses/${course.slug}/quiz`} className="block rounded-lg bg-green-700 px-4 py-2.5 text-center text-sm font-medium text-white">
              ทำแบบทดสอบท้ายหลักสูตร
            </Link>
          ) : next ? (
            <Link href={`/courses/${course.slug}/lessons/${next.id}`} className="block rounded-lg bg-green-700 px-4 py-2.5 text-center text-sm font-medium text-white">
              {lessons.some((l) => l.completed || l.watchedPercent > 0) ? "เรียนต่อ" : "เริ่มเรียน"}: {next.title}
            </Link>
          ) : (
            <Alert tone="warning">บางบทเรียนใช้งานไม่ได้ชั่วคราว ระบบแจ้งผู้สอนแล้ว</Alert>
          )}
        </Card>
        <Card flush>
          <h2 className="border-b border-stone-100 px-4 py-3 font-semibold">บทเรียน</h2>
          <LessonList slug={course.slug} lessons={lessons} enrolled={enrolled} />
        </Card>
      </aside>
    </main>
  );
}
