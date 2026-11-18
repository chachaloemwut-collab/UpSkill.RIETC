import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Alert, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { QuizRunner } from "@/components/course/QuizRunner";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";

export const metadata: Metadata = { title: "แบบทดสอบ" };

export default async function QuizPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await getCourseForViewer(slug, user);
  if (!data) notFound();
  if (!data.enrollment) redirect(`/courses/${slug}`);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href={`/courses/${slug}`} className="truncate transition-colors hover:text-foreground">
              {data.course.title}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" /> แบบทดสอบ
          </span>
        }
        title="แบบทดสอบท้ายหลักสูตร"
        description="ตอบคำถามให้ได้คะแนนตามเกณฑ์เพื่อรับใบรับรอง"
      />
      {data.enrollment.status === "completed" ? (
        <div className="grid gap-4">
          <Alert variant="success" title="คุณสอบผ่านหลักสูตรนี้แล้ว" />
          <Link href={`/courses/${slug}/certificate`} className={buttonClass("default", "lg", "justify-self-start")}>
            ไปหน้าใบรับรอง
          </Link>
        </div>
      ) : data.completionRule === "lesson_tests_average" ? (
        <div className="grid gap-4">
          <Alert variant="default" title="หลักสูตรนี้ไม่มีแบบทดสอบท้ายหลักสูตร">ผลการเรียนคิดจากคะแนนแบบทดสอบท้ายคลิปรวมกัน</Alert>
          <Link href={`/courses/${slug}`} className={buttonClass("outline", "md", "justify-self-start")}>กลับไปหน้าหลักสูตร</Link>
        </div>
      ) : !data.postTest.configured ? (
        <div className="grid gap-4">
          <Alert variant="warning" title="ยังไม่ได้ตั้งค่า Post-test">กรุณาติดต่อผู้สอน</Alert>
          <Link href={`/courses/${slug}`} className={buttonClass("outline", "md", "justify-self-start")}>กลับไปหน้าหลักสูตร</Link>
        </div>
      ) : !data.readyForPostTest ? (
        <div className="grid gap-4">
          <Alert variant="warning" title="ยังทำ Post-test ไม่ได้">กรุณาเรียนและผ่านแบบทดสอบท้ายคลิปให้ครบก่อน</Alert>
          <Link href={`/courses/${slug}`} className={buttonClass("outline", "md", "justify-self-start")}>
            กลับไปหน้าหลักสูตร
          </Link>
        </div>
      ) : (
        <QuizRunner
          courseId={data.course.id}
          slug={slug}
          passingScore={data.course.passing_quiz_score}
          timeLimitMin={Math.round(data.course.quiz_time_limit_sec / 60)}
        />
      )}
    </div>
  );
}
