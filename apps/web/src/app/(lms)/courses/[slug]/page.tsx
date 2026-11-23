import { formatStudyDurationTh } from "@upskill/core/study-hours";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Award, BadgeCheck, ClipboardList, BookOpen, ChevronRight, Clock, Eye, ListOrdered, Pencil, PlayCircle, Target, Timer, TriangleAlert, UserRound } from "lucide-react";
import { Alert, Badge, Card, Progress, buttonClass } from "@/components/ui";
import { EnrollButton } from "@/components/course/EnrollButton";
import { ClampText } from "@/components/common/ClampText";
import { CourseCover } from "@/components/course/CourseCard";
import { LessonList } from "@/components/course/LessonList";
import { VISIBILITY } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getCourseForViewer } from "@/server/courses/courses.service";
import { COURSE_TYPE_INFO } from "@upskill/core/application";

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
  const { course, enrollment, lessons, certificate, manager, units, lessonTests } = data;
  const free = data.navigationMode === "free_complete";
  const averageRule = data.completionRule === "lesson_tests_average";
  const next = lessons.find((l) => l.unlocked && !l.completed && !l.broken);
  const pendingLessonTest = lessons.find((l) => l.completed && l.lessonTestRequired && !l.lessonTestDone);
  const enrolled = !!enrollment && enrollment.status !== "revoked";
  const done = lessons.filter((l) => l.completed && l.lessonTestDone).length;
  const pendingCheckpoint = lessons.find((l) => l.unlocked && !l.checkpointPassed && l.watchedPercent > 0);
  // average rule: every test answered but the combined score is short -> retake the tests not yet passed
  const retakeLesson = averageRule && lessonTests.answered === lessonTests.tests && !lessonTests.passed ? lessons.find((l) => l.lessonTestRequired && !l.lessonTestPassed) : undefined;
  const progress = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
  const vis = VISIBILITY[course.visibility];

  const criteria = [
    ...(data.preTest.required ? [{ icon: Target, text: "ทำ Pre-test ก่อนเริ่มเรียน", sub: "ใช้วัดความรู้พื้นฐานและไม่ตัดสิทธิ์การเรียน" }] : []),
    free
      ? { icon: Eye, text: `ดูวิดีโอครบทั้ง ${lessons.length} คลิป ทุกช่วง`, sub: "เลื่อนดูช่วงไหนก่อนก็ได้ ระบบนับเฉพาะช่วงที่ดูจริงด้วยความเร็วปกติ" }
      : { icon: Eye, text: `ดูวิดีโอแต่ละคลิปอย่างน้อย ${course.min_watch_percentage}%`, sub: "ดูต่อเนื่องตามลำดับ ระบบนับเวลาจริง" },
    ...(course.is_sequential_locked ? [{ icon: ListOrdered, text: "เรียนตามลำดับคลิป", sub: "คลิปถัดไปจะเปิดเมื่อเรียนคลิปก่อนหน้าครบ" }] : []),
    ...(lessons.some((lesson) => lesson.checkpoint) ? [{ icon: Target, text: "ตอบคำถามระหว่างคลิปให้ถูก", sub: "คลิปจะนับว่าครบเมื่อตอบคำถามระหว่างคลิปถูกแล้ว" }] : []),
    averageRule
      ? { icon: Target, text: `คะแนนแบบทดสอบท้ายคลิปรวมกันอย่างน้อย ${course.passing_quiz_score}%`, sub: `ต้องทำครบทุกคลิป ทำซ้ำเพื่อเพิ่มคะแนนได้ ${course.max_quiz_attempts_per_day} ครั้งต่อวันต่อคลิป` }
      : { icon: Target, text: `สอบผ่านอย่างน้อย ${course.passing_quiz_score}%`, sub: `สอบได้ ${course.max_quiz_attempts_per_day} ครั้งต่อวัน` },
    { icon: Timer, text: `เวลาทำแบบทดสอบ ${Math.round(course.quiz_time_limit_sec / 60)} นาที`, sub: "ข้อสอบและตัวเลือกสุ่มลำดับทุกครั้ง" },
    ...(!averageRule && lessons.some((lesson) => lesson.lessonTestRequired) ? [{ icon: ListOrdered, text: "ผ่านแบบทดสอบระหว่างอบรม", sub: "ต้องผ่านแบบทดสอบท้ายคลิปก่อนไปขั้นถัดไป" }] : []),
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

      {/* ---------- Course Hero Banner with Blurred Cover Backdrop ---------- */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-6 shadow-xs sm:p-8">
        {lessons[0]?.videoId && (
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 rounded-full bg-primary/20 blur-3xl opacity-30"
          />
        )}
        <div className="relative z-10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {course.is_verified_course ? (
              <Badge variant="success" className="gap-1 shadow-xs">
                <BadgeCheck className="h-3.5 w-3.5" /> Verified Course
              </Badge>
            ) : (
              <Badge variant="secondary">Community Course</Badge>
            )}
            <Badge variant="outline" className="gap-1 bg-background/60">
              <Award className="h-3.5 w-3.5 text-primary" /> {COURSE_TYPE_INFO[data.courseType].label}
            </Badge>
            {course.visibility !== "published" && vis && <Badge variant={vis.variant}>{vis.label}</Badge>}
          </div>

          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{course.title}</h1>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
              <UserRound className="h-4 w-4 text-primary" /> {course.instructor_name}
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <BookOpen className="h-4 w-4" /> {lessons.length} บทเรียน
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium font-mono tabular-nums">
              <Clock className="h-4 w-4" /> {formatStudyDurationTh(course.total_duration_sec)}
            </span>
          </div>

          {data.application.enabled && (data.application.courseCode || data.application.intake || data.application.schedule || data.application.venue) && (
            <dl className="mt-4 grid max-w-3xl gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {data.application.courseCode && <div className="flex gap-2"><dt className="text-muted-foreground">รหัสหลักสูตร</dt><dd className="font-medium">{data.application.courseCode}</dd></div>}
              {data.application.intake && <div className="flex gap-2"><dt className="text-muted-foreground">รุ่น</dt><dd className="font-medium">{data.application.intake}</dd></div>}
              {data.application.schedule && <div className="flex gap-2"><dt className="text-muted-foreground">วันและเวลาเรียน</dt><dd className="font-medium">{data.application.schedule}</dd></div>}
              {data.application.venue && <div className="flex gap-2"><dt className="text-muted-foreground">สถานที่</dt><dd className="font-medium">{data.application.venue}</dd></div>}
            </dl>
          )}

          {course.description && (
            <ClampText className="mt-4 max-w-3xl text-sm leading-relaxed text-foreground/80 sm:text-base">{course.description}</ClampText>
          )}

          {manager && (
            <div className="mt-5">
              <Link href={`/instructor/courses/${course.id}`} className={buttonClass("outline", "sm", "gap-1.5")}>
                <Pencil className="h-3.5 w-3.5" /> จัดการหลักสูตรนี้
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          {/* ---------- Visual Learning Path Stepper ---------- */}
          <Card className="p-5 sm:p-6">
            <h2 className="text-base font-semibold tracking-tight mb-4 flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> เส้นทางการเรียนรู้สู่ความสำเร็จ
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
              {/* Step 1 */}
              <div className="relative flex flex-col items-center text-center p-3 rounded-lg border bg-muted/20">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary mb-2">
                  1
                </span>
                <p className="font-semibold text-xs text-foreground">
                  {data.preTest.required ? "ทำแบบทดสอบ Pre-test" : "ลงทะเบียนเรียน"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {data.preTest.required ? "วัดระดับก่อนเริ่ม" : "เข้าสู่บทเรียน"}
                </p>
              </div>

              {/* Step 2 */}
              <div className="relative flex flex-col items-center text-center p-3 rounded-lg border bg-muted/20">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary mb-2">
                  2
                </span>
                <p className="font-semibold text-xs text-foreground">
                  เรียนวิดีโอ {lessons.length} คลิป{units.length > 0 ? ` (${units.length} หน่วย)` : ""}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{free ? "ดูครบทุกช่วง" : `ผ่านเกณฑ์ ≥ ${course.min_watch_percentage}%`}</p>
              </div>

              {/* Step 3 */}
              <div className="relative flex flex-col items-center text-center p-3 rounded-lg border bg-muted/20">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary mb-2">
                  3
                </span>
                <p className="font-semibold text-xs text-foreground">
                  {lessons.some((l) => l.lessonTestRequired) ? "แบบทดสอบท้ายคลิป" : "คำถามระหว่างคลิป"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">ทบทวนความเข้าใจ</p>
              </div>

              {/* Step 4 */}
              <div className="relative flex flex-col items-center text-center p-3 rounded-lg border bg-muted/20">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary mb-2">
                  4
                </span>
                <p className="font-semibold text-xs text-foreground">{averageRule ? "คะแนนรวมแบบทดสอบ" : "ทำแบบทดสอบ Post-test"}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">ผ่านเกณฑ์ ≥ {course.passing_quiz_score}%</p>
              </div>

              {/* Step 5 */}
              <div className="col-span-2 sm:col-span-4 lg:col-span-1 relative flex flex-col items-center text-center p-3 rounded-lg border border-primary/20 bg-primary/5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground mb-2 shadow-xs">
                  5
                </span>
                <p className="font-semibold text-xs text-primary">รับวุฒิบัตรดิจิทัล</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">ลงนาม Ed25519</p>
              </div>
            </div>
          </Card>


          <Card>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-semibold">เนื้อหาหลักสูตร</h2>
              <span className="text-sm text-muted-foreground">
                {units.length > 0 ? `${units.length} หน่วย · ` : ""}
                {lessons.length} คลิป · {formatStudyDurationTh(course.total_duration_sec)}
              </span>
            </div>
            <LessonList slug={course.slug} lessons={lessons} units={units} enrolled={enrolled} />
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

        <aside className="order-first min-w-0 lg:order-none lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            <CourseCover videoId={lessons[0]?.videoId ?? null} title={course.title} />
            <div className="grid gap-4 p-5">
              {enrolled && (
                <div className="grid gap-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ความคืบหน้า</span>
                    <span className="font-medium tabular-nums">
                      {done}/{lessons.length} คลิป · {progress}%
                    </span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}
              {enrolled && averageRule && lessonTests.tests > 0 && (
                <div className="grid gap-1.5 rounded-lg border bg-muted/30 p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">คะแนนแบบทดสอบท้ายคลิป</span>
                    <span className="font-medium tabular-nums">
                      {lessonTests.correct}/{lessonTests.totalQuestions} ข้อ
                    </span>
                  </div>
                  <Progress value={lessonTests.totalQuestions ? (lessonTests.correct / lessonTests.totalQuestions) * 100 : 0} />
                  <p className="text-xs text-muted-foreground">
                    ทำแล้ว {lessonTests.answered}/{lessonTests.tests} คลิป · เกณฑ์ผ่าน {course.passing_quiz_score}% (
                    {Math.ceil((course.passing_quiz_score / 100) * lessonTests.totalQuestions)} ข้อ)
                  </p>
                </div>
              )}
              {!enrolled && course.visibility === "archived" ? (
                <Alert variant="warning" title="หลักสูตรสิ้นสุดแล้ว (Archived)">
                  หลักสูตรนี้ปิดการเรียนการสอนหรือสิ้นสุดโครงการแล้ว ผู้เรียนเดิมที่จบหลักสูตรยังคงดูและดาวน์โหลดวุฒิบัตรได้ตลอดชีพ
                </Alert>
              ) : !enrolled && data.programOnly ? (
                <div className="grid gap-2">
                  <p className="text-sm text-muted-foreground">รายวิชานี้เปิดให้เรียนผ่านการสมัครหลักสูตรอบรม</p>
                  {data.programs.map((p) => (
                    <Link key={p.slug} href={`/programs/${p.slug}`} className={buttonClass("default", "lg", "w-full")}>
                      สมัคร {p.title} <ArrowRight className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              ) : !enrolled && data.myApplication?.status === "submitted" ? (
                <>
                  <Alert variant="default" title={`ส่งใบสมัครแล้ว เลขที่ ${data.myApplication.application_no}`}>รอเจ้าหน้าที่พิจารณา ระบบจะแจ้งผลทางอีเมล</Alert>
                  <Link href={`/courses/${course.slug}/apply`} className={buttonClass("outline", "lg", "w-full")}>ดูใบสมัคร</Link>
                </>
              ) : !enrolled && data.myApplication?.status === "rejected" ? (
                <>
                  <Alert variant="warning" title="ใบสมัครไม่ผ่านการพิจารณา">ติดต่อผู้จัดการหลักสูตรหากมีข้อสงสัย</Alert>
                  <Link href={`/courses/${course.slug}/apply`} className={buttonClass("outline", "lg", "w-full")}>ดูใบสมัคร</Link>
                </>
              ) : !enrolled && data.application.enabled ? (
                user ? (
                  <Link href={`/courses/${course.slug}/apply`} className={buttonClass("default", "lg", "w-full")}>
                    <ClipboardList className="h-4 w-4" /> กรอกใบสมัครเพื่อลงทะเบียน
                  </Link>
                ) : (
                  <Link href="/login" className={buttonClass("default", "lg", "w-full")}>เข้าสู่ระบบเพื่อสมัครเรียน</Link>
                )
              ) : !enrolled ? (
                <EnrollButton courseId={course.id} loggedIn={!!user} />
              ) : enrollment?.status === "completed" ? (
                <>
                  <Alert variant="success" title="คุณเรียนจบและสอบผ่านหลักสูตรนี้แล้ว" />
                  {course.credential_enabled && <Link href={`/courses/${course.slug}/certificate`} className={buttonClass("default", "lg", "w-full")}>
                    <Award className="h-4 w-4" /> {certificate ? `ดู${course.credential_name_th}` : `รับ${course.credential_name_th}`}
                  </Link>}
                </>
              ) : data.preTest.required && !data.preTest.completed ? (
                <Link href={`/courses/${course.slug}/pre-test`} className={buttonClass("default", "lg", "w-full")}>
                  ทำ Pre-test ก่อนเริ่มเรียน <ArrowRight className="h-4 w-4" />
                </Link>
              ) : pendingLessonTest ? (
                <Link href={`/courses/${course.slug}/lessons/${pendingLessonTest.id}/test`} className={buttonClass("default", "lg", "w-full")}>
                  ทำแบบทดสอบท้ายคลิปที่ {pendingLessonTest.order} <ArrowRight className="h-4 w-4" />
                </Link>
              ) : retakeLesson ? (
                <>
                  <Alert variant="warning" title={`คะแนนรวมยังไม่ถึง ${course.passing_quiz_score}%`}>ทำแบบทดสอบท้ายคลิปที่ยังตอบไม่ถูกใหม่ได้ ระบบใช้คะแนนครั้งที่ดีที่สุด</Alert>
                  <Link href={`/courses/${course.slug}/lessons/${retakeLesson.id}/test`} className={buttonClass("default", "lg", "w-full")}>
                    ทำแบบทดสอบคลิปที่ {retakeLesson.order} ใหม่ <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : data.readyForPostTest ? (
                <Link href={`/courses/${course.slug}/quiz`} className={buttonClass("default", "lg", "w-full")}>
                  ทำ Post-test ท้ายหลักสูตร <ArrowRight className="h-4 w-4" />
                </Link>
              ) : !next && pendingCheckpoint ? (
                <Link href={`/courses/${course.slug}/lessons/${pendingCheckpoint.id}`} className={buttonClass("default", "lg", "w-full")}>
                  ตอบคำถามระหว่างคลิปที่ {pendingCheckpoint.order} <ArrowRight className="h-4 w-4" />
                </Link>
              ) : next ? (
                <Link href={`/courses/${course.slug}/lessons/${next.id}`} className={buttonClass("default", "lg", "w-full")}>
                  <PlayCircle className="h-4 w-4" />
                  <span className="truncate">{done > 0 || lessons.some((l) => l.watchedPercent > 0) ? "เรียนต่อ" : "เริ่มเรียน"}: คลิปที่ {next.order}</span>
                </Link>
              ) : (
                <Alert variant="warning" title="บางบทเรียนใช้งานไม่ได้ชั่วคราว">ระบบแจ้งผู้สอนแล้ว</Alert>
              )}
              <ul className="grid gap-2 text-sm text-muted-foreground">
                {enrolled && data.myApplication && (
                  <li className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    <Link href={`/courses/${course.slug}/apply`} className="hover:text-foreground hover:underline">
                      ใบสมัครเลขที่ {data.myApplication.application_no}
                    </Link>
                  </li>
                )}
                <li className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" /> {units.length > 0 ? `${units.length} หน่วยการเรียนรู้ · ` : ""}
                  {lessons.length} คลิปวิดีโอ
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4" /> เนื้อหารวม {formatStudyDurationTh(course.total_duration_sec)}
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
