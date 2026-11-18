import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Alert, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { ApplicationSummary, CourseApplicationForm } from "@/components/course/CourseApplicationForm";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";
import { getApplyContext } from "@/server/courses/applications.service";
import { HttpError } from "@/server/http";

export const metadata: Metadata = { title: "ใบสมัครเรียน" };

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await getCourseForViewer(slug, user);
  if (!data) notFound();
  if (!data.application.enabled && !data.myApplication) redirect(`/courses/${slug}`);

  let context;
  try {
    context = await getApplyContext(user, data.course.id);
  } catch (err) {
    if (err instanceof HttpError) {
      return (
        <div className="mx-auto grid max-w-3xl gap-4">
          <Alert variant="warning" title={err.message === err.code ? "ไม่สามารถสมัครหลักสูตรนี้ได้" : err.message} />
          <Link href={`/courses/${slug}`} className={buttonClass("outline", "md", "justify-self-start")}>กลับไปหน้าหลักสูตร</Link>
        </div>
      );
    }
    throw err;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href={`/courses/${slug}`} className="truncate transition-colors hover:text-foreground">{data.course.title}</Link>
            <ChevronRight className="h-3.5 w-3.5" /> ใบสมัคร
          </span>
        }
        title="ใบสมัครเรียนรายวิชา"
        description="กรอกครั้งเดียวต่อหลักสูตร ข้อมูลส่วนตัวดึงจากบัญชีของคุณโดยอัตโนมัติ"
      />
      {context.application ? (
        <ApplicationSummary application={context.application} courseSlug={slug} />
      ) : data.enrollment ? (
        <Alert variant="success" title="คุณลงทะเบียนหลักสูตรนี้แล้ว" />
      ) : !context.profile ? (
        <div className="grid gap-4">
          <Alert variant="warning" title="กรุณากรอกข้อมูลส่วนตัวให้ครบก่อนสมัคร">ข้อมูลชื่อ เลขประจำตัวประชาชน และที่อยู่ใช้ในใบสมัครและใบรับรอง</Alert>
          <Link href="/me/profile" className={buttonClass("default", "md", "justify-self-start")}>ไปกรอกข้อมูลส่วนตัว</Link>
        </div>
      ) : (
        <CourseApplicationForm
          courseId={data.course.id}
          courseSlug={slug}
          courseTitle={data.course.title}
          settings={context.settings}
          profile={context.profile}
          minor={context.minor}
          pendingFiles={context.pendingFiles}
        />
      )}
    </div>
  );
}
