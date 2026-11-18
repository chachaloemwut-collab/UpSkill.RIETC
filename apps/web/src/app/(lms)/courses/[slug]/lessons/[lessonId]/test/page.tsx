import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Alert, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { QuizRunner } from "@/components/course/QuizRunner";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";

export const metadata: Metadata = { title: "แบบทดสอบท้ายคลิป" };

export default async function LessonTestPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await getCourseForViewer(slug, user);
  if (!data) notFound();
  if (!data.enrollment) redirect(`/courses/${slug}`);
  const lesson = data.lessons.find((item) => item.id === lessonId);
  if (!lesson || !lesson.lessonTestRequired) notFound();
  const averageRule = data.completionRule === "lesson_tests_average";
  const idx = data.lessons.indexOf(lesson);
  const next = data.lessons.slice(idx + 1).find((l) => !l.broken);
  const continueHref = next ? `/courses/${slug}/lessons/${next.id}` : `/courses/${slug}`;
  // average rule: a lesson already answered may be retaken to raise its best score, unless it is already 100%
  const canRetake = averageRule && data.enrollment.status !== "completed" && !lesson.lessonTestPassed;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Link href={`/courses/${slug}`}>{data.course.title}</Link><ChevronRight className="h-3.5 w-3.5" /> คลิปที่ {lesson.order}</span>}
        title={`แบบทดสอบท้ายคลิป: ${lesson.title}`}
        description={averageRule ? `คะแนนของทุกคลิปรวมกันต้องได้อย่างน้อย ${data.course.passing_quiz_score}% จึงผ่านหลักสูตร` : "ผ่านแบบทดสอบท้ายคลิปเพื่อไปขั้นถัดไป"}
      />
      {!lesson.completed ? (
        <div className="grid gap-4"><Alert variant="warning" title="ยังทำแบบทดสอบไม่ได้">กรุณาดูวิดีโอคลิปนี้ให้ครบก่อน</Alert><Link href={`/courses/${slug}/lessons/${lesson.id}`} className={buttonClass("outline", "lg", "justify-self-start")}>กลับไปดูคลิปนี้</Link></div>
      ) : lesson.lessonTestDone && !canRetake ? (
        <div className="grid gap-4"><Alert variant="success" title={lesson.lessonTestBestScore !== null ? `ทำแบบทดสอบคลิปนี้แล้ว · คะแนน ${Math.round(lesson.lessonTestBestScore)}%` : "ผ่านแบบทดสอบท้ายคลิปแล้ว"} /><Link href={continueHref} className={buttonClass("default", "lg", "justify-self-start")}>เรียนต่อ</Link></div>
      ) : (
        <div className="grid gap-4">
          {lesson.lessonTestDone && lesson.lessonTestBestScore !== null && (
            <Alert variant="default" title={`คะแนนที่ดีที่สุดของคลิปนี้ ${Math.round(lesson.lessonTestBestScore)}%`}>ทำใหม่ได้เพื่อเพิ่มคะแนนรวม ระบบใช้คะแนนครั้งที่ดีที่สุด</Alert>
          )}
          <QuizRunner courseId={data.course.id} slug={slug} passingScore={data.course.passing_quiz_score} timeLimitMin={Math.round(data.course.quiz_time_limit_sec / 60)} assessmentKind="lesson" lessonId={lesson.id} averageRule={averageRule} continueHref={continueHref} />
        </div>
      )}
    </div>
  );
}
