import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Alert, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { QuizRunner } from "@/components/course/QuizRunner";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";

export const metadata: Metadata = { title: "แบบทดสอบประจำบท" };

export default async function LessonTestPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await getCourseForViewer(slug, user);
  if (!data) notFound();
  if (!data.enrollment) redirect(`/courses/${slug}`);
  const lesson = data.lessons.find((item) => item.id === lessonId);
  if (!lesson || !lesson.lessonTestRequired) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Link href={`/courses/${slug}`}>{data.course.title}</Link><ChevronRight className="h-3.5 w-3.5" /> บทที่ {lesson.order}</span>}
        title={`แบบทดสอบระหว่างอบรม: ${lesson.title}`}
        description="ผ่านแบบทดสอบประจำบทเพื่อปลดล็อกบทถัดไป"
      />
      {!lesson.completed ? (
        <div className="grid gap-4"><Alert variant="warning" title="ยังทำแบบทดสอบไม่ได้">กรุณาดูวิดีโอบทนี้ให้ครบเกณฑ์ก่อน</Alert><Link href={`/courses/${slug}/lessons/${lesson.id}`} className={buttonClass("outline", "lg", "justify-self-start")}>กลับไปเรียนบทนี้</Link></div>
      ) : lesson.lessonTestPassed ? (
        <div className="grid gap-4"><Alert variant="success" title="ผ่านแบบทดสอบประจำบทแล้ว" /><Link href={`/courses/${slug}`} className={buttonClass("default", "lg", "justify-self-start")}>กลับไปเรียนต่อ</Link></div>
      ) : (
        <QuizRunner courseId={data.course.id} slug={slug} passingScore={data.course.passing_quiz_score} timeLimitMin={Math.round(data.course.quiz_time_limit_sec / 60)} assessmentKind="lesson" lessonId={lesson.id} />
      )}
    </div>
  );
}
