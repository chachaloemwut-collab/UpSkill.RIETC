import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { PageTitle } from "@/components/ui";
import { CourseEditor, type EditorData } from "@/components/instructor/CourseEditor";
import { ctx } from "@/server/context";
import { HttpError } from "@/server/http";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForEditing, PUBLISH_RULES } from "@/server/courses/instructor.service";

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
    questions: data.questions.map((q) => ({ ...q, options: q.options as EditorData["questions"][number]["options"] })),
    devManualDuration: !env.YOUTUBE_API_KEY && env.APP_ENV !== "production",
    publishRules: PUBLISH_RULES,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageTitle>{data.course.title}</PageTitle>
      <CourseEditor data={editor} />
    </main>
  );
}
