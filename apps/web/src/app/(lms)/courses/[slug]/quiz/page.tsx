import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert, PageTitle } from "@/components/ui";
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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <PageTitle sub={`เกณฑ์ผ่าน ${data.course.passing_quiz_score}% · เวลา ${Math.round(data.course.quiz_time_limit_sec / 60)} นาที`}>
        แบบทดสอบ: {data.course.title}
      </PageTitle>
      {data.enrollment.status === "completed" ? (
        <Alert tone="success">
          คุณสอบผ่านแล้ว{" "}
          <Link href={`/courses/${slug}/certificate`} className="underline">
            ไปหน้าใบรับรอง
          </Link>
        </Alert>
      ) : !data.allLessonsCompleted ? (
        <Alert tone="warning">กรุณาเรียนให้ครบทุกบทก่อนทำแบบทดสอบ</Alert>
      ) : (
        <QuizRunner courseId={data.course.id} slug={slug} />
      )}
    </main>
  );
}
