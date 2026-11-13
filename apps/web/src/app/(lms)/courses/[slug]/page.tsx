import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Award, BadgeCheck, BookOpen, ChevronRight, Clock, Eye, ListOrdered, Pencil, PlayCircle, Target, Timer, TriangleAlert, UserRound } from "lucide-react";
import { Alert, Badge, Card, Progress, buttonClass } from "@/components/ui";
import { EnrollButton } from "@/components/course/EnrollButton";
import { CourseCover } from "@/components/course/CourseCard";
import { LessonList } from "@/components/course/LessonList";
import { VISIBILITY, formatDuration } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCourseForViewer(slug, null);
  return data ? { title: data.course.title, description: data.course.description ?? undefined } : {};
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const data = await getCourseForViewer(slug, user);
  if (!data) notFound();
  const { course, enrollment, lessons, allLessonsCompleted, certificate, manager } = data;
  const next = lessons.find((l) => l.unlocked && !l.completed && !l.broken);
  const enrolled = !!enrollment && enrollment.status !== "revoked";
  const done = lessons.filter((l) => l.completed).length;
  const progress = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
  const vis = VISIBILITY[course.visibility];

  const criteria = [
    { icon: Eye, text: `ดูวิดีโอแต่ละบทอย่างน้อย ${course.min_watch_percentage}%`, sub: "ระบบนับเวลาจริง กรอข้ามหรือเร่งความเร็วไม่ได้" },
    ...(course.is_sequential_locked ? [{ icon: ListOrdered, text: "เรียนตามลำดับบท", sub: "บทถัดไปจะเปิดเมื่อเรียนบทก่อนหน้าครบ" }] : []),
    { icon: Target, text: `สอบผ่านอย่างน้อย ${course.passing_quiz_score}%`, sub: `สอบได้ ${course.max_quiz_attempts_per_day} ครั้งต่อวัน` },
    { icon: Timer, text: `เวลาทำแบบทดสอบ ${Math.round(course.quiz_time_limit_sec / 60)} นาที`, sub: "ข้อสอบและตัวเลือกสุ่มลำดับทุกครั้ง" },
    ...(course.credential_enabled ? [{ icon: Award, text: course.credential_name_th, sub: "ตรวจสอบสถานะได้ผ่าน QR Code" }] : []),
  ];

  return (
    <>
      <nav aria-label="breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/courses" className="transition-colors hover:text-foreground">
          คลังหลักสูตร
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate text-foreground">{course.title}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid min-w-0 content-start gap-6">
          <section>
            <div className="mb-3 flex flex-wrap gap-2">
              {course.is_verified_course ? (
                <Badge variant="success">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified Course
                </Badge>
              ) : (
                <Badge variant="secondary">Community Course</Badge>
              )}
              {course.visibility !== "published" && vis && <Badge variant={vis.variant}>{vis.label}</Badge>}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-4 w-4" /> {course.instructor_name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="h-4 w-4" /> {lessons.length} บทเรียน
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> {formatDuration(course.total_duration_sec)}
              </span>
            </div>
            {course.description && <p className="mt-5 whitespace-pre-line leading-relaxed text-foreground/90">{course.description}</p>}
            {manager && (
              <Link href={`/instructor/courses/${course.id}`} className={buttonClass("outline", "sm", "mt-5")}>
                <Pencil className="h-3.5 w-3.5" /> จัดการหลักสูตรนี้
              </Link>
            )}
          </section>

          <Card>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-semibold">เนื้อหาหลักสูตร</h2>
              <span className="text-sm text-muted-foreground">
                {lessons.length} บท · {formatDuration(course.total_duration_sec)}
              </span>
            </div>
            <LessonList slug={course.slug} lessons={lessons} enrolled={enrolled} />
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 font-semibold">เกณฑ์การผ่านหลักสูตร</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {criteria.map((c) => (
                <li key={c.text} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <c.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{c.text}</p>
                    <p className="text-xs text-muted-foreground">{c.sub}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            <CourseCover videoId={lessons[0]?.videoId ?? null} title={course.title} />
            <div className="grid gap-4 p-5">
              {enrolled && (
                <div className="grid gap-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ความคืบหน้า</span>
                    <span className="font-medium tabular-nums">
                      {done}/{lessons.length} บท · {progress}%
                    </span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}
              {!enrolled ? (
                <EnrollButton courseId={course.id} loggedIn={!!user} />
              ) : enrollment?.status === "completed" ? (
                <>
                  <Alert variant="success" title="คุณเรียนจบและสอบผ่านหลักสูตรนี้แล้ว" />
                  {course.credential_enabled && <Link href={`/courses/${course.slug}/certificate`} className={buttonClass("default", "lg", "w-full")}>
                    <Award className="h-4 w-4" /> {certificate ? `ดู${course.credential_name_th}` : `รับ${course.credential_name_th}`}
                  </Link>}
                </>
              ) : allLessonsCompleted ? (
                <Link href={`/courses/${course.slug}/quiz`} className={buttonClass("default", "lg", "w-full")}>
                  ทำแบบทดสอบท้ายหลักสูตร <ArrowRight className="h-4 w-4" />
                </Link>
              ) : next ? (
                <Link href={`/courses/${course.slug}/lessons/${next.id}`} className={buttonClass("default", "lg", "w-full")}>
                  <PlayCircle className="h-4 w-4" />
                  <span className="truncate">{done > 0 || lessons.some((l) => l.watchedPercent > 0) ? "เรียนต่อ" : "เริ่มเรียน"}: บทที่ {next.order}</span>
                </Link>
              ) : (
                <Alert variant="warning" title="บางบทเรียนใช้งานไม่ได้ชั่วคราว">ระบบแจ้งผู้สอนแล้ว</Alert>
              )}
              <ul className="grid gap-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" /> {lessons.length} บทเรียนวิดีโอ
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4" /> เนื้อหารวม {formatDuration(course.total_duration_sec)}
                </li>
                <li className="flex items-center gap-2">
                  <Award className="h-4 w-4" /> {course.credential_enabled ? `${course.credential_name_th}เมื่อผ่านเกณฑ์` : "ไม่มีเอกสารรับรองสำหรับหลักสูตรนี้"}
                </li>
                {lessons.some((l) => l.broken) && (
                  <li className="flex items-center gap-2 text-warning">
                    <TriangleAlert className="h-4 w-4" /> มีวิดีโอที่ใช้งานไม่ได้ชั่วคราว
                  </li>
                )}
              </ul>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
