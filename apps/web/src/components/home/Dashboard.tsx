import Link from "next/link";
import { ArrowRight, Award, BookOpen, CheckCircle2, Clock, GraduationCap, Library, PlayCircle, Presentation } from "lucide-react";
import { Card, EmptyState, Progress, buttonClass } from "@/components/ui";
import { PageHeader, SectionTitle } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { CourseCard, CourseCover } from "@/components/course/CourseCard";
import { listPublishedCourses, learnerOverview } from "@/server/courses/courses.service";
import { myRegistrations } from "@/server/programs/cohorts.service";
import { listUpcomingCohorts } from "@/server/programs/programs.service";
import { UpcomingCohortCard } from "@/components/programs/UpcomingCohortCard";
import { COHORT_PHASE, REGISTRATION_STATUS, formatDateTimeTh } from "@/lib/format";
import { Badge } from "@/components/ui";
import type { getViewer } from "@/server/viewer";

type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;

/** Signed-in home: stats, continue learning, suggestions. Rendered by app/page.tsx inside the LMS shell. */
export async function Dashboard({ viewer }: { viewer: Viewer }) {
  const courses = await listPublishedCourses();

  const [{ enrollments, stats }, registrations, upcoming] = await Promise.all([learnerOverview(viewer.id), myRegistrations(viewer.id), listUpcomingCohorts(3)]);
  const activeRegs = registrations.filter((r) => r.phase !== "completed" && r.phase !== "cancelled" && r.status !== "rejected");
  const appliedCohorts = new Set(registrations.map((r) => r.cohort_id));
  const openForMe = upcoming.filter((c) => !appliedCohorts.has(c.id));
  const inProgress = enrollments.filter((e) => e.status === "in_progress");
  const enrolledSlugs = new Set(enrollments.map((e) => e.slug));
  const suggestions = courses.filter((c) => !enrolledSlugs.has(c.slug)).slice(0, 4);
  const studyHours = Math.floor(stats.studySec / 3600);
  const studyMinutes = Math.round((stats.studySec % 3600) / 60);

  return (
    <>
      <PageHeader title={`สวัสดี, ${viewer.name}`} description="ติดตามความคืบหน้าและเรียนต่อจากที่ค้างไว้">
        <Link href="/courses" className={buttonClass("outline")}>
          <Library className="h-4 w-4" /> คลังหลักสูตร
        </Link>
        {(viewer.role === "instructor" || viewer.role === "admin") && (
          <Link href="/instructor" className={buttonClass("default")}>
            <Presentation className="h-4 w-4" /> จัดการหลักสูตร
          </Link>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label="คอร์สที่ลงทะเบียน" value={stats.enrolled} unit="คอร์ส" icon={<BookOpen />} />
        <StatCard index={1} label="เรียนจบแล้ว" value={stats.completed} unit="คอร์ส" icon={<CheckCircle2 />} />
        <StatCard index={2} label="ใบรับรอง" value={stats.certificates} unit="ใบ" icon={<Award />} />
        <StatCard
          index={3}
          label="เวลาเรียนสะสมจริง"
          value={studyHours > 0 ? studyHours : studyMinutes}
          unit={studyHours > 0 ? `ชม. ${studyMinutes} นาที` : "นาที"}
          hint="นับเฉพาะเวลาที่ผ่านระบบตรวจสอบ"
          icon={<Clock />}
        />
      </div>

      <section className="mt-8">
        <SectionTitle
          action={
            enrollments.length > 0 && (
              <Link href="/my-courses" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                ดูทั้งหมด <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )
          }
        >
          เรียนต่อ
        </SectionTitle>
        {inProgress.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="h-5 w-5" />}
            title={enrollments.length ? "เรียนจบทุกคอร์สที่ลงทะเบียนแล้ว" : "ยังไม่ได้ลงทะเบียนเรียน"}
            description="เลือกหลักสูตรที่สนใจจากคลังหลักสูตร"
            action={
              <Link href="/courses" className={buttonClass("default")}>
                เลือกหลักสูตร
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {inProgress.slice(0, 4).map((e, i) => (
              <Card
                key={e.slug}
                className="group flex animate-slide-up flex-col overflow-hidden transition-shadow [animation-fill-mode:both] hover:shadow-md sm:flex-row"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <Link href={`/courses/${e.slug}`} className="relative block overflow-hidden sm:w-56 sm:shrink-0">
                  <CourseCover videoId={e.cover_video_id} title={e.title} className="sm:absolute sm:inset-0 sm:aspect-auto" />
                </Link>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <Link href={`/courses/${e.slug}`} className="line-clamp-1 font-semibold tracking-tight hover:underline">
                      {e.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      เรียนแล้ว {e.completed_lessons}/{e.lesson_count} บท
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">ความคืบหน้า</span>
                      <span className="font-medium tabular-nums">{e.progressPercent}%</span>
                    </div>
                    <Progress value={e.progressPercent} />
                  </div>
                  <div className="mt-auto">
                    {e.next_lesson_id ? (
                      <Link href={`/courses/${e.slug}/lessons/${e.next_lesson_id}`} className={buttonClass("default", "sm", "max-w-full")}>
                        <PlayCircle className="h-4 w-4" /> <span className="truncate">เรียนต่อ: {e.next_lesson_title}</span>
                      </Link>
                    ) : (
                      <Link href={`/courses/${e.slug}/quiz`} className={buttonClass("default", "sm")}>
                        ทำแบบทดสอบท้ายหลักสูตร <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {activeRegs.length > 0 && (
        <section className="mt-8">
          <SectionTitle>รอบอบรมที่คุณสมัคร</SectionTitle>
          <Card className="divide-y">
            {activeRegs.map((r) => {
              const st = REGISTRATION_STATUS[r.status];
              const ph = COHORT_PHASE[r.phase];
              return (
                <Link key={r.id} href={`/programs/${r.program_slug}`} className="flex flex-wrap items-center gap-3 p-4 transition-colors hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.program_title}</p>
                    <p className="text-xs text-muted-foreground">{r.cohort_title} · เริ่มอบรม {formatDateTimeTh(r.starts_at)}</p>
                  </div>
                  {ph && <Badge variant="outline">{ph.label}</Badge>}
                  {st && <Badge variant={st.variant}>{st.label}</Badge>}
                </Link>
              );
            })}
          </Card>
        </section>
      )}

      {openForMe.length > 0 && (
        <section className="mt-8">
          <SectionTitle
            action={
              <Link href="/programs" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                ดูทั้งหมด <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            รอบอบรมที่เปิดรับสมัคร
          </SectionTitle>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {openForMe.map((c) => <UpcomingCohortCard key={c.id} c={c} />)}
          </div>
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="mt-8">
          <SectionTitle
            action={
              <Link href="/courses" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                คลังหลักสูตร <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            หลักสูตรแนะนำ
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {suggestions.map((c, i) => (
              <CourseCard key={c.id} course={c} index={i} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
