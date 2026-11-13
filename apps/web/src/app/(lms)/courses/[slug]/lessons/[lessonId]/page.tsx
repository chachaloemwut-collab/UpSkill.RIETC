import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { LessonList } from "@/components/course/LessonList";
import { LessonPlayer } from "@/components/learning/LessonPlayer";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";

export const metadata: Metadata = { title: "บทเรียน" };

export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await getCourseForViewer(slug, user);
  if (!data) notFound();
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) notFound();
  if (!data.enrollment) redirect(`/courses/${slug}`);

  const idx = data.lessons.indexOf(lesson);
  const nextLesson = data.lessons[idx + 1];

  return (
    // Mobile: the player is a direct child of <main> so it stays stuck to the top while the details
    // and lesson list scroll underneath (spec 7.3). Desktop: two-column grid.
    <main className="mx-auto max-w-6xl lg:grid lg:grid-cols-[1fr_360px] lg:gap-x-6 lg:px-4 lg:py-6">
      <div className="sticky top-0 z-20 bg-black lg:static lg:col-start-1 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-stone-200">
        {!lesson.unlocked ? (
          <div className="bg-stone-50 p-4">
            <Alert tone="warning">กรุณาเรียนบทก่อนหน้าให้ครบก่อน</Alert>
          </div>
        ) : lesson.broken ? (
          <div className="bg-stone-50 p-4">
            <Alert tone="error">วิดีโอบทนี้ใช้งานไม่ได้ชั่วคราว ระบบแจ้งผู้สอนแล้ว</Alert>
          </div>
        ) : (
          <LessonPlayer
            lessonId={lesson.id}
            videoId={lesson.videoId}
            durationSec={lesson.durationSec}
            initialMaxWatchedSec={lesson.maxWatchedSec}
            minWatchPercentage={data.course.min_watch_percentage}
            initiallyCompleted={lesson.completed}
          />
        )}
      </div>
      <div className="space-y-3 p-4 lg:col-start-1 lg:px-0">
        <p className="text-sm text-stone-500">
          <Link href={`/courses/${slug}`} className="underline">
            {data.course.title}
          </Link>{" "}
          · บทที่ {lesson.order}
        </p>
        <h1 className="text-xl font-bold">{lesson.title}</h1>
        {lesson.completed && nextLesson && (
          <Link href={`/courses/${slug}/lessons/${nextLesson.id}`} className="inline-block rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white">
            บทถัดไป: {nextLesson.title} →
          </Link>
        )}
        {lesson.completed && !nextLesson && data.allLessonsCompleted && (
          <Link href={`/courses/${slug}/quiz`} className="inline-block rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white">
            ทำแบบทดสอบท้ายหลักสูตร →
          </Link>
        )}
      </div>
      <aside className="px-4 pb-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:px-0 lg:pb-0">
        <Card flush>
          <h2 className="border-b border-stone-100 px-4 py-3 font-semibold">บทเรียนทั้งหมด</h2>
          <LessonList slug={slug} lessons={data.lessons} enrolled activeId={lesson.id} />
        </Card>
      </aside>
    </main>
  );
}
