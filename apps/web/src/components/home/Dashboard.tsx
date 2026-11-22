import Link from "next/link";
import { ArrowRight, Award, BookOpen, CheckCircle2, Clock, GraduationCap, Library, PlayCircle, Presentation, Sparkles } from "lucide-react";
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

/** Signed-in home: stats, continue learning spotlight, readiness widget, suggestions. */
export async function Dashboard({ viewer }: { viewer: Viewer }) {
  const courses = await listPublishedCourses();

  const [{ enrollments, stats }, registrations, upcoming] = await Promise.all([learnerOverview(viewer.id), myRegistrations(viewer.id), listUpcomingCohorts(3)]);
  const activeRegs = registrations.filter((r) => r.phase !== "completed" && r.phase !== "cancelled" && r.status !== "rejected");
  const appliedCohorts = new Set(registrations.map((r) => r.cohort_id));
  const openForMe = upcoming.filter((c) => !appliedCohorts.has(c.id));
  const inProgress = enrollments.filter((e) => e.status === "in_progress");
  const nearCompletion = inProgress.filter((e) => e.progressPercent >= 75 || !e.next_lesson_id);
  const otherInProgress = inProgress.slice(1, 5);
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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          index={0}
          label="คอร์สที่ลงทะเบียน"
          value={stats.enrolled}
          unit="คอร์ส"
          tone="primary"
          icon={<BookOpen />}
        />
        <StatCard
          index={1}
          label="เรียนจบแล้ว"
          value={stats.completed}
          unit="คอร์ส"
          tone="success"
          subBadge={stats.enrolled > 0 ? `สำเร็จแล้ว ${stats.completed} จาก ${stats.enrolled} คอร์ส` : undefined}
          icon={<CheckCircle2 />}
        />
        <StatCard
          index={2}
          label="วุฒิบัตรที่ได้รับ"
          value={stats.certificates}
          unit="ใบ"
          tone="info"
          hint="ลงนามดิจิทัล Ed25519 ตรวจสอบได้"
          icon={<Award />}
        />
        <StatCard
          index={3}
          label="เวลาเรียนสะสมจริง"
          value={studyHours > 0 ? studyHours : studyMinutes}
          unit={studyHours > 0 ? `ชม. ${studyMinutes} นาที` : "นาที"}
          tone="warning"
          hint="นับเฉพาะเวลาที่ผ่านระบบตรวจสอบ"
          icon={<Clock />}
        />
      </div>

      {/* ---------- Continue Learning Section with Spotlight Hero ---------- */}
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
          <div className="grid gap-5">
            {/* Spotlight Hero Card for the latest in-progress course */}
            {inProgress[0] && (
              <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-5 shadow-sm transition-all hover:shadow-md sm:p-6">
                <div className="grid gap-6 md:grid-cols-[240px_1fr] items-center">
                  <Link href={`/courses/${inProgress[0].slug}`} className="relative block aspect-video overflow-hidden rounded-lg border shadow-xs group">
                    <CourseCover videoId={inProgress[0].cover_video_id} title={inProgress[0].title} />
                  </Link>
                  <div className="flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          <Sparkles className="h-3 w-3" /> เรียนต่อล่าสุด
                        </span>
                        <span className="text-xs text-muted-foreground">
                          เรียนแล้ว {inProgress[0].completed_lessons}/{inProgress[0].lesson_count} บท
                        </span>
                      </div>
                      <Link href={`/courses/${inProgress[0].slug}`} className="text-lg font-bold tracking-tight hover:underline sm:text-xl">
                        {inProgress[0].title}
                      </Link>
                      {inProgress[0].next_lesson_title && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                          บทถัดไป: <span className="text-foreground font-medium">{inProgress[0].next_lesson_title}</span>
                        </p>
                      )}
                    </div>

                    <div className="grid gap-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-muted-foreground">ความคืบหน้ารวม</span>
                        <span className="tabular-nums font-semibold text-primary">{inProgress[0].progressPercent}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-700"
                          style={{ width: `${inProgress[0].progressPercent}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      {inProgress[0].next_lesson_id ? (
                        <Link
                          href={`/courses/${inProgress[0].slug}/lessons/${inProgress[0].next_lesson_id}`}
                          className={buttonClass("default", "lg", "h-10 px-5 shadow-sm gap-2")}
                        >
                          <PlayCircle className="h-4 w-4" /> เรียนต่อทันที
                        </Link>
                      ) : (
                        <Link
                          href={`/courses/${inProgress[0].slug}/quiz`}
                          className={buttonClass("default", "lg", "h-10 px-5 shadow-sm gap-2")}
                        >
                          <Award className="h-4 w-4" /> ทำแบบทดสอบรับวุฒิบัตร
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Other in-progress courses */}
            {otherInProgress.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {otherInProgress.map((e, i) => (
                  <Card
                    key={e.slug}
                    className="group flex animate-slide-up flex-col overflow-hidden transition-shadow [animation-fill-mode:both] hover:shadow-md sm:flex-row"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <Link href={`/courses/${e.slug}`} className="relative block overflow-hidden sm:w-48 sm:shrink-0">
                      <CourseCover videoId={e.cover_video_id} title={e.title} className="sm:absolute sm:inset-0 sm:aspect-auto" />
                    </Link>
                    <div className="flex flex-1 flex-col gap-2.5 p-4">
                      <div>
                        <Link href={`/courses/${e.slug}`} className="line-clamp-1 font-semibold tracking-tight hover:underline text-sm">
                          {e.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          เรียนแล้ว {e.completed_lessons}/{e.lesson_count} บท
                        </p>
                      </div>
                      <div className="grid gap-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">ความคืบหน้า</span>
                          <span className="font-medium tabular-nums">{e.progressPercent}%</span>
                        </div>
                        <Progress value={e.progressPercent} />
                      </div>
                      <div className="mt-auto pt-1">
                        {e.next_lesson_id ? (
                          <Link href={`/courses/${e.slug}/lessons/${e.next_lesson_id}`} className={buttonClass("default", "sm", "w-full justify-center")}>
                            <PlayCircle className="h-3.5 w-3.5" /> <span className="truncate">เรียนต่อ</span>
                          </Link>
                        ) : (
                          <Link href={`/courses/${e.slug}/quiz`} className={buttonClass("default", "sm", "w-full justify-center")}>
                            ทำแบบทดสอบ <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------- Learning Activity & Certificate Readiness Widget ---------- */}
      {nearCompletion.length > 0 && (
        <section className="mt-8">
          <SectionTitle>ความพร้อมรับวุฒิบัตร (Certificate Readiness)</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {nearCompletion.map((c) => (
              <Card key={c.slug} className="flex items-center justify-between gap-4 p-4 border-success/30 bg-success/5 transition hover:shadow-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-success mb-1">
                    <Award className="h-4 w-4 shrink-0" />
                    <span>{c.next_lesson_id ? "ความคืบหน้าใกล้สำเร็จ (≥ 75%)" : "พร้อมสอบ Post-test ทันที"}</span>
                  </div>
                  <p className="truncate font-semibold text-sm">{c.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ความคืบหน้า {c.progressPercent}% ({c.completed_lessons}/{c.lesson_count} บท)
                  </p>
                </div>
                <Link
                  href={c.next_lesson_id ? `/courses/${c.slug}/lessons/${c.next_lesson_id}` : `/courses/${c.slug}/quiz`}
                  className={buttonClass("default", "sm", "shrink-0 gap-1.5 shadow-xs")}
                >
                  {c.next_lesson_id ? "เรียนจบคอร์ส" : "เข้าสอบทันที"} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
            ))}
          </div>
        </section>
      )}

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
