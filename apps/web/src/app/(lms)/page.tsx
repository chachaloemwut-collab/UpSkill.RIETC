import Link from "next/link";
import { ArrowRight, Award, BadgeCheck, BookOpen, CheckCircle2, Clock, GraduationCap, Library, PlayCircle, Presentation, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Card, EmptyState, Progress, Stepper, buttonClass } from "@/components/ui";
import { PageHeader, SectionTitle } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { CourseCard, CourseCover } from "@/components/course/CourseCard";
import { listPublishedCourses, learnerOverview } from "@/server/courses/courses.service";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const viewer = await getViewer();
  const courses = await listPublishedCourses();
  if (!viewer) return <Landing courses={courses} />;

  const { enrollments, stats } = await learnerOverview(viewer.id);
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

const STEPS = [
  { title: "ลงทะเบียน", description: "เลือกและลงทะเบียนหลักสูตร" },
  { title: "ดูวิดีโอ", description: "ระบบนับเวลาเรียนจริง" },
  { title: "ทำแบบทดสอบ", description: "สุ่มข้อและจับเวลา" },
  { title: "รับใบรับรอง", description: "ตรวจสอบได้ด้วย QR" },
];

const FEATURES = [
  { icon: ShieldCheck, title: "กันโกงเวลาเรียน", text: "ตรวจสอบทุกช่วงที่ดูฝั่งเซิร์ฟเวอร์ กรอข้าม เร่งความเร็ว หรือเปิดหลายแท็บจะไม่ถูกนับ" },
  { icon: BadgeCheck, title: "ใบรับรองลงนามดิจิทัล", text: "ใบรับรองทุกใบลงนามด้วย Ed25519 ใครก็ตรวจสอบความถูกต้องได้ผ่าน QR Code" },
  { icon: Sparkles, title: "เรียนได้ทุกอุปกรณ์", text: "ออกแบบให้ใช้บนมือถือก่อน วิดีโอติดด้านบนจอขณะเลื่อนดูรายละเอียดบทเรียน" },
];

function Landing({ courses }: { courses: Awaited<ReturnType<typeof listPublishedCourses>> }) {
  return (
    <>
      <section className="relative overflow-hidden rounded-xl border bg-card px-6 py-12 sm:px-10 sm:py-16">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative max-w-2xl">
          <Badge variant="outline" className="mb-4 gap-1.5 bg-background">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> ระบบจัดการการเรียนรู้และใบรับรอง
          </Badge>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            เรียนรู้จากหลักสูตร
            <br />
            <span className="text-muted-foreground">ได้ใบรับรองที่เชื่อถือได้จริง</span>
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            หลักสูตรจากวิดีโอ YouTube ที่ระบบนับเวลาเรียนจริง สอบผ่านแล้วรับใบรับรองดิจิทัลที่ใครก็ตรวจสอบได้
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className={buttonClass("default", "lg")}>
              สมัครสมาชิก <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/courses" className={buttonClass("outline", "lg")}>
              ดูคลังหลักสูตร
            </Link>
          </div>
        </div>
      </section>

      <Card className="mt-6 p-6">
        <Stepper steps={STEPS} current={STEPS.length} />
      </Card>

      <section className="mt-10">
        <SectionTitle
          action={
            <Link href="/courses" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              ดูทั้งหมด <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          หลักสูตรล่าสุด
        </SectionTitle>
        {courses.length === 0 ? (
          <EmptyState icon={<Library className="h-5 w-5" />} title="ยังไม่มีหลักสูตรที่เผยแพร่" description="ยังไม่มีรายการหลักสูตรให้แสดง" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {courses.slice(0, 8).map((c, i) => (
              <CourseCard key={c.id} course={c} index={i} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <f.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
          </Card>
        ))}
      </section>
    </>
  );
}
