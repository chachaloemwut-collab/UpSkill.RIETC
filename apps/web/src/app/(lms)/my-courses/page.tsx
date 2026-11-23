import { EnrollmentLinks } from "@/components/course/EnrollmentLinks";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, BookOpen, PlayCircle } from "lucide-react";
import { Badge, EmptyState, Tabs, TabsContent, TabsList, TabsTrigger, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { CourseCard } from "@/components/course/CourseCard";
import { getCurrentUser } from "@/server/auth/session";
import { learnerOverview } from "@/server/courses/courses.service";

export const metadata: Metadata = { title: "คอร์สของฉัน" };

type Enrollment = Awaited<ReturnType<typeof learnerOverview>>["enrollments"][number];

export default async function MyCoursesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <Suspense fallback={<LoadingSkeleton label="กำลังโหลดหลักสูตรของฉัน" />}><EnrolledCourses user={user} /></Suspense>;
}

async function EnrolledCourses({ user }: { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }) {
  const { enrollments } = await learnerOverview(user.id);
  const inProgress = enrollments.filter((e) => e.status === "in_progress");
  const completed = enrollments.filter((e) => e.status === "completed");

  return (
    <>
      <PageHeader title="คอร์สของฉัน" description="หลักสูตรที่คุณลงทะเบียนเรียน">
        <Link href="/courses" className={buttonClass("outline")}>
          หาคอร์สเพิ่ม
        </Link>
      </PageHeader>
      {enrollments.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="ยังไม่ได้ลงทะเบียนเรียน"
          description="เลือกหลักสูตรที่ต้องการจากคลังหลักสูตร"
          action={
            <Link href="/courses" className={buttonClass("default")}>
              ไปที่คลังหลักสูตร
            </Link>
          }
        />
      ) : (
        <Tabs defaultValue={inProgress.length ? "progress" : "done"}>
          <TabsList>
            <TabsTrigger value="progress">กำลังเรียน ({inProgress.length})</TabsTrigger>
            <TabsTrigger value="done">เรียนจบแล้ว ({completed.length})</TabsTrigger>
            <TabsTrigger value="all">ทั้งหมด ({enrollments.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="progress" className="mt-5">
            <Grid items={inProgress} empty="ไม่มีคอร์สที่กำลังเรียน" />
          </TabsContent>
          <TabsContent value="done" className="mt-5">
            <Grid items={completed} empty="ยังไม่มีคอร์สที่เรียนจบ" />
          </TabsContent>
          <TabsContent value="all" className="mt-5">
            <Grid items={enrollments} empty="" />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

function Grid({ items, empty }: { items: Enrollment[]; empty: string }) {
  if (items.length === 0) return <EmptyState title={empty} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((e, i) => (
        <div key={e.enrollment_id}><CourseCard
          index={i}
          course={e}
          progress={e.progressPercent}
          href={e.status === "in_progress" && e.next_lesson_id ? `/courses/${e.slug}/lessons/${e.next_lesson_id}` : `/courses/${e.slug}`}
          footer={
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {e.status === "completed" ? (
                <Badge variant="success">
                  <Award className="h-3.5 w-3.5" /> เรียนจบแล้ว
                </Badge>
              ) : e.status === "revoked" ? (
                <Badge variant="destructive">ถูกเพิกถอน</Badge>
              ) : (
                <Badge variant="secondary">
                  <PlayCircle className="h-3.5 w-3.5" /> {e.next_lesson_title ? `ต่อ: ${e.next_lesson_title}` : "พร้อมทำแบบทดสอบ"}
                </Badge>
              )}
            </div>
          }
        /><EnrollmentLinks id={e.enrollment_id} code={e.certificate_code} completed={e.status === "completed" && !e.revoked_at} /></div>
      ))}
    </div>
  );
}
