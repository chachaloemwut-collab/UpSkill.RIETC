import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, Lock, TriangleAlert } from "lucide-react";
import { Card, Progress, buttonClass } from "@/components/ui";
import { LessonList } from "@/components/course/LessonList";
import { LessonPlayer } from "@/components/learning/LessonPlayer";
import { formatDuration } from "@/lib/format";
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
  const prevLesson = data.lessons[idx - 1];
  const nextLesson = data.lessons[idx + 1];
  const done = data.lessons.filter((l) => l.completed).length;
  const progress = Math.round((done / data.lessons.length) * 100);

  return (
    <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-6">
      {/* Mobile: the player is sticky under the top bar while the details and lesson list scroll underneath (spec 7.3) */}
      <div className="sticky top-14 z-20 -mx-4 -mt-4 bg-black sm:-mx-6 sm:-mt-6 lg:static lg:col-start-1 lg:m-0 lg:overflow-hidden lg:rounded-lg lg:border">
        {!lesson.unlocked ? (
          <LockedNotice icon={<Lock className="h-6 w-6" />} title="บทนี้ยังล็อกอยู่" text="กรุณาเรียนบทก่อนหน้าให้ครบก่อน" />
        ) : lesson.broken ? (
          <LockedNotice icon={<TriangleAlert className="h-6 w-6" />} title="วิดีโอบทนี้ใช้งานไม่ได้ชั่วคราว" text="ระบบแจ้งผู้สอนแล้ว" />
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

      <div className="grid gap-4 py-5 lg:col-start-1 lg:pb-0">
        <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href={`/courses/${slug}`} className="truncate transition-colors hover:text-foreground">
            {data.course.title}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0">บทที่ {lesson.order}</span>
        </nav>
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{lesson.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ความยาว {formatDuration(lesson.durationSec)} · ต้องดูอย่างน้อย {data.course.min_watch_percentage}%
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {prevLesson && (
            <Link href={`/courses/${slug}/lessons/${prevLesson.id}`} className={buttonClass("outline")}>
              <ArrowLeft className="h-4 w-4" /> บทก่อนหน้า
            </Link>
          )}
          {lesson.completed && lesson.lessonTestRequired && !lesson.lessonTestPassed && (
            <Link href={`/courses/${slug}/lessons/${lesson.id}/test`} className={buttonClass("default")}>
              ทำแบบทดสอบประจำบท <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          {nextLesson && lesson.lessonTestPassed && (lesson.completed || nextLesson.unlocked) && !nextLesson.broken && (
            <Link href={`/courses/${slug}/lessons/${nextLesson.id}`} className={buttonClass(lesson.completed ? "default" : "outline")}>
              บทถัดไป <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          {!nextLesson && data.readyForPostTest && (
            <Link href={`/courses/${slug}/quiz`} className={buttonClass("default")}>
              ทำ Post-test ท้ายหลักสูตร <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      <aside className="pb-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pb-0">
        <Card className="lg:sticky lg:top-20">
          <div className="grid gap-2 border-b px-4 py-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">บทเรียนทั้งหมด</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {done}/{data.lessons.length} บท
              </span>
            </div>
            <Progress value={progress} />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <LessonList slug={slug} lessons={data.lessons} enrolled activeId={lesson.id} />
          </div>
        </Card>
      </aside>
    </div>
  );
}

function LockedNotice({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-background text-muted-foreground">{icon}</span>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
