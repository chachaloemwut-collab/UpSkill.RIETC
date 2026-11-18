import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Badge, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { VISIBILITY } from "@/lib/format";
import { CourseEditor, type EditorData } from "@/components/instructor/CourseEditor";
import { ctx } from "@/server/context";
import { HttpError } from "@/server/http";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForEditing, PUBLISH_RULES } from "@/server/courses/instructor.service";
import { listApplications } from "@/server/courses/applications.service";

export const metadata: Metadata = { title: "แก้ไขหลักสูตร" };

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!z.uuid().safeParse(id).success) notFound();

  let data;
  try {
    data = await getCourseForEditing(user, id);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }
  const { env } = ctx();
  const editor: EditorData = {
    course: data.course,
    lessons: data.lessons,
    units: data.units,
    applications: (await listApplications(user, id)).map((a) => ({ ...a, created_at: new Date(a.created_at).toISOString() })),
    questions: data.questions.map((q) => ({
      ...q,
      assessment_type: q.assessment_type as EditorData["questions"][number]["assessment_type"],
      options: q.options as EditorData["questions"][number]["options"],
    })),
    devManualDuration: !env.YOUTUBE_API_KEY && env.APP_ENV !== "production",
    publishRules: PUBLISH_RULES,
  };

  const vis = VISIBILITY[data.course.visibility];
  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href="/instructor" className="transition-colors hover:text-foreground">
              จัดการหลักสูตร
            </Link>
            <ChevronRight className="h-3.5 w-3.5" /> แก้ไข
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {data.course.title}
            <Badge variant={vis?.variant ?? "secondary"}>{vis?.label ?? data.course.visibility}</Badge>
          </span>
        }
        description="จัดการบทเรียน ข้อสอบ และเกณฑ์การผ่าน"
      >
        <Link href={`/courses/${data.course.slug}`} className={buttonClass("outline")}>
          <ExternalLink className="h-4 w-4" /> ดูหน้าหลักสูตร
        </Link>
      </PageHeader>
      <CourseEditor data={editor} />
    </>
  );
}
