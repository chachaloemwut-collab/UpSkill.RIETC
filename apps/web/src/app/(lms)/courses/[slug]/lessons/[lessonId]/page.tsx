import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpenText, ChevronRight, Lock, TriangleAlert } from "lucide-react";
import { Alert, Card, Progress, buttonClass } from "@/components/ui";
import { LessonList } from "@/components/course/LessonList";
import { LessonPlayer, type PlayerAction } from "@/components/learning/LessonPlayer";
import { LessonVideoShareButton } from "@/components/learning/LessonVideoShareButton";
import { formatDuration } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";
import { getCheckpointState } from "@/server/learning/checkpoint.service";

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
  const done = data.lessons.filter((l) => l.completed && l.lessonTestDone).length;
  const progress = Math.round((done / data.lessons.length) * 100);
  const unit = data.units.find((u) => u.id === lesson.unitId) ?? null;
  const free = data.navigationMode === "free_complete";
  const testHref = `/courses/${slug}/lessons/${lesson.id}/test`;
  const nextLessonOpen = !!nextLesson && nextLesson.unlocked && !nextLesson.broken;
  const courseCompleted = data.enrollment.status === "completed";

  // The single "what next" step, shown over the player at the end and as the main button below it
  const nextAction: PlayerAction | null =
    lesson.completed && lesson.lessonTestRequired && !lesson.lessonTestDone
      ? { href: testHref, label: "ทำแบบทดสอบท้ายคลิป" }
      : courseCompleted
        ? { href: `/courses/${slug}/certificate`, label: "เรียนจบแล้ว — รับวุฒิบัตร" }
        : nextLessonOpen
          ? { href: `/courses/${slug}/lessons/${nextLesson.id}`, label: `คลิปถัดไป: ${nextLesson.title}` }
          : data.readyForPostTest
            ? { href: `/courses/${slug}/quiz`, label: "ทำ Post-test ท้ายหลักสูตร" }
            : lesson.completed
              ? { href: `/courses/${slug}`, label: "ดูความคืบหน้าทั้งหลักสูตร" }
              : null;

  return (
    <div
      id="lesson-layout-container"
      data-theater="false"
      className="group/theater transition-all duration-300 lg:grid lg:grid-cols-[1fr_340px] lg:gap-6 data-[theater=true]:lg:grid-cols-1"
    >
      {/* Mobile: the player is sticky under the top bar while the details and lesson list scroll underneath (spec 7.3) */}
      <div className="sticky top-14 z-20 -mx-4 -mt-4 bg-black sm:-mx-6 sm:-mt-6 lg:static lg:col-start-1 lg:m-0 lg:overflow-hidden lg:rounded-lg lg:border">
        {!lesson.unlocked ? (
          <LockedNotice icon={<Lock className="h-6 w-6" />} title="คลิปนี้ยังล็อกอยู่" text="หลักสูตรนี้เรียนตามลำดับ กรุณาเรียนคลิปก่อนหน้าให้ครบก่อน" />
        ) : lesson.broken ? (
          <LockedNotice icon={<TriangleAlert className="h-6 w-6" />} title="วิดีโอคลิปนี้ใช้งานไม่ได้ชั่วคราว" text="ระบบแจ้งผู้สอนแล้ว" />
        ) : (
          <LessonPlayer
            key={lesson.id}
            lessonId={lesson.id}
            videoId={lesson.videoId}
            durationSec={lesson.durationSec}
            initialMaxWatchedSec={lesson.maxWatchedSec}
            initialWatchedChunks={lesson.watchedChunks}
            initialPositionSec={lesson.lastPositionSec}
            minWatchPercentage={data.course.min_watch_percentage}
            navigationMode={data.navigationMode}
            initiallyCompleted={lesson.completed}
            checkpoint={lesson.checkpoint}
            checkpointState={lesson.checkpoint ? await getCheckpointState(user.id, lesson.id) : null}
            lessonTest={
              lesson.lessonTestRequired
                ? { done: lesson.lessonTestDone, bestScore: lesson.lessonTestBestScore, href: testHref, available: lesson.completed }
                : null
            }
            nextAction={nextAction}
            isPublic={lesson.isPublic}
          />
        )}
      </div>

      <div className="grid gap-4 py-5 lg:col-start-1 lg:pb-0">
        <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link href={`/courses/${slug}`} className="truncate transition-colors hover:text-foreground">
            {data.course.title}
          </Link>
          {unit && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">หน่วยที่ {unit.number}</span>
            </>
          )}
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0">คลิปที่ {lesson.order}</span>
        </nav>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{lesson.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ความยาว {formatDuration(lesson.durationSec)} ·{" "}
              {free ? "เลื่อนดูช่วงไหนก่อนก็ได้ แต่ต้องดูให้ครบทุกช่วง" : `ต้องดูอย่างน้อย ${data.course.min_watch_percentage}% ตามลำดับ`}
            </p>
          </div>
          <div className="shrink-0 pt-1">
            <LessonVideoShareButton videoId={lesson.videoId} isPublic={lesson.isPublic} />
          </div>
        </div>

        {lesson.learnerNote && (
          <Alert variant="warning" title="ข้อควรระวังสำหรับผู้เรียน">
            <span className="whitespace-pre-line">{lesson.learnerNote}</span>
          </Alert>
        )}
        {lesson.description && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{lesson.description}</p>}

        <div className="flex flex-wrap items-center gap-2">
          {prevLesson && (
            <Link href={`/courses/${slug}/lessons/${prevLesson.id}`} className={buttonClass("outline")}>
              <ArrowLeft className="h-4 w-4" /> คลิปก่อนหน้า
            </Link>
          )}
          {nextAction && (lesson.completed || nextLessonOpen) && (
            <Link href={nextAction.href} className={buttonClass(lesson.completed ? "default" : "outline")}>
              {nextAction.label} <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {unit?.summary && (
          <Card className="overflow-hidden">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 hover:bg-muted/40">
                <span className="flex items-center gap-2 font-semibold">
                  <BookOpenText className="h-4 w-4 text-primary" /> บทความสรุปหน่วยที่ {unit.number}: {unit.title}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <div className="whitespace-pre-line border-t px-5 py-4 text-sm leading-relaxed text-foreground/90">{unit.summary}</div>
            </details>
          </Card>
        )}
      </div>

      <aside className="pb-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pb-0 group-data-[theater=true]/theater:lg:col-start-1 group-data-[theater=true]/theater:lg:row-span-1 group-data-[theater=true]/theater:lg:mt-6">
        <Card className="lg:sticky lg:top-20">
          <div className="grid gap-2 border-b px-4 py-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">เนื้อหาทั้งหมด</h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {done}/{data.lessons.length} คลิป
              </span>
            </div>
            <Progress value={progress} />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <LessonList slug={slug} lessons={data.lessons} units={data.units} enrolled activeId={lesson.id} compact />
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
