import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Alert, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { QuizRunner } from "@/components/course/QuizRunner";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";

export const metadata: Metadata = { title: "Pre-test" };

export default async function PreTestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await getCourseForViewer(slug, user);
  if (!data) notFound();
  if (!data.enrollment) redirect(`/courses/${slug}`);
  if (!data.preTest.required) redirect(`/courses/${slug}`);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Link href={`/courses/${slug}`}>{data.course.title}</Link><ChevronRight className="h-3.5 w-3.5" /> Pre-test</span>}
        title="แบบประเมินก่อนเรียน"
        description="ใช้สำรวจความรู้พื้นฐานก่อนเริ่มอบรม ผลคะแนนไม่ใช้ตัดสิทธิ์การเรียน"
      />
      {data.preTest.completed ? (
        <div className="grid gap-4">
          <Alert variant="success" title="ทำ Pre-test เรียบร้อยแล้ว" />
          <Link href={`/courses/${slug}`} className={buttonClass("default", "lg", "justify-self-start")}>เริ่มเรียน</Link>
        </div>
      ) : (
        <QuizRunner courseId={data.course.id} slug={slug} passingScore={data.course.passing_quiz_score} timeLimitMin={Math.round(data.course.quiz_time_limit_sec / 60)} assessmentKind="pre" />
      )}
    </div>
  );
}
