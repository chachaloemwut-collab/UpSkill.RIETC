import Link from "next/link";
import { ArrowRight, Award, BadgeCheck, BookOpen, CircleCheck, ClipboardCheck, PlayCircle, QrCode, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { AnimatedNumber, EmptyState, Reveal, SpotlightCard, buttonClass } from "@/components/ui";
import { BRAND_NAME, BrandLogo } from "@/components/brand/BrandLogo";
import { CourseCover } from "@/components/course/CourseCard";
import { listPublishedCourses, publicStats } from "@/server/courses/courses.service";
import { listUpcomingCohorts } from "@/server/programs/programs.service";
import { listPublicAnnouncements } from "@/server/programs/announcements.service";
import { AnnouncementCard } from "@/components/programs/AnnouncementCard";
import { UpcomingCohortCard } from "@/components/programs/UpcomingCohortCard";
import { LandingNav } from "./LandingNav";
import { COURSE_TYPES, COURSE_TYPE_INFO } from "@upskill/core/application";

const STEPS = [
  { icon: UserPlus, title: "สมัครและลงทะเบียน", text: "สร้างบัญชี เลือกหลักสูตร และกรอกใบสมัครเมื่อหลักสูตรกำหนด" },
  { icon: PlayCircle, title: "เรียนจากวิดีโอ", text: "ระบบบันทึกเวลาเรียนจริงของแต่ละบทจากฝั่งเซิร์ฟเวอร์" },
  { icon: ClipboardCheck, title: "ทำแบบทดสอบ", text: "ทำแบบทดสอบตามเกณฑ์ที่เจ้าของหลักสูตรกำหนด" },
  { icon: Award, title: "รับใบรับรองหรือประกาศนียบัตร", text: "เอกสารลงนามดิจิทัล ตรวจสอบสถานะได้ด้วย QR Code" },
];

const FEATURES = [
  { icon: ShieldCheck, title: "ตรวจสอบเวลาเรียน", text: "ระบบตรวจสอบช่วงเวลาที่ดูจากฝั่งเซิร์ฟเวอร์ และไม่บันทึกช่วงที่กรอข้าม เร่งความเร็ว หรือเปิดเรียนซ้ำหลายแท็บ" },
  { icon: BadgeCheck, title: "ใบรับรองลงนามดิจิทัล", text: "ใบรับรองลงนามด้วย Ed25519 และตรวจสอบสถานะได้จาก QR Code หรือรหัสใบรับรอง" },
  { icon: Sparkles, title: "ติดตามผลการเรียน", text: "หน้าหลักสูตรแสดงบทเรียน ความคืบหน้า ผลการประเมิน และสถานะใบรับรองในลำดับงานเดียวกัน" },
];

/** Faint grid that fades out from the center; sits behind hero/CTA content. */
const GRID =
  "pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]";

/** Public landing page for visitors who are not signed in. */
export async function LandingPage() {
  const [courses, stats, upcoming, announcements] = await Promise.all([listPublishedCourses(), publicStats(), listUpcomingCohorts(3), listPublicAnnouncements({ limit: 3 })]);
  // The landing page promotes no single course: it presents the kinds of training on offer
  const typeCounts = { certified_training: stats.certifiedTraining, short_course: stats.shortCourses } as const;
  const longContent = stats.durationSec >= 10 * 3600;
  const statItems = [
    { label: "หลักสูตรที่เผยแพร่", value: stats.courses },
    { label: "บทเรียนวิดีโอ", value: stats.lessons },
    { label: longContent ? "ชั่วโมงของเนื้อหา" : "นาทีของเนื้อหา", value: Math.round(stats.durationSec / (longContent ? 3600 : 60)) },
    { label: "ใบรับรองที่ออกแล้ว", value: stats.certificates },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <LandingNav />

      {/* ---------- Hero ---------- */}
      <section className="relative -mt-16 overflow-hidden pt-16">
        <div aria-hidden className={GRID} />
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-28 lg:pt-24">
          <div className="text-center lg:text-left">
            <span className="inline-flex animate-slide-up items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur [animation-fill-mode:both]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative h-2 w-2 rounded-full bg-primary" />
              </span>
              {BRAND_NAME}
            </span>
            <h1 className="mt-6 animate-slide-up text-5xl font-bold tracking-tight [animation-delay:80ms] [animation-fill-mode:both] sm:text-6xl lg:text-7xl">
              <Accent>U</Accent>pskill. <Accent>R</Accent>eskill.
            </h1>
            <p className="mt-4 animate-slide-up text-xl font-medium text-foreground/80 [animation-delay:160ms] [animation-fill-mode:both] sm:text-2xl">
              เรียนรู้จากหลักสูตรออนไลน์ พร้อมใบรับรองที่ตรวจสอบสถานะได้
            </p>
            <p className="mx-auto mt-4 max-w-xl animate-slide-up text-muted-foreground [animation-delay:240ms] [animation-fill-mode:both] lg:mx-0">
              บทเรียนวิดีโอจัดเป็นหลักสูตร ระบบบันทึกเวลาเรียนจริง ทำแบบทดสอบท้ายหลักสูตร แล้วรับใบรับรองดิจิทัลที่ตรวจสอบได้ด้วย QR Code
            </p>
            <div className="mt-8 flex animate-slide-up flex-wrap justify-center gap-3 [animation-delay:320ms] [animation-fill-mode:both] lg:justify-start">
              <Link href="/courses" className={buttonClass("default", "lg", "group h-11 px-6")}>
                ดูหลักสูตรทั้งหมด <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="/register" className={buttonClass("outline", "lg", "h-11 px-6")}>
                สมัครสมาชิก
              </Link>
            </div>
          </div>

          <HeroVisual coverVideoId={null} title="ห้องเรียนออนไลน์" />
        </div>
      </section>

      {/* ---------- Trust Bar ---------- */}
      <section className="border-y border-border/70 bg-card/60 py-4.5 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-around gap-6 px-4 text-xs font-medium text-muted-foreground sm:px-6">
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-primary" />
            <span>มาตรฐานลงนามดิจิทัล Ed25519</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Server-Side Anti-Cheat ป้องกันโกงเวลาเรียน</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>ติดตามความก้าวหน้าแบบ Telemetry เรียลไทม์</span>
          </div>
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-primary" />
            <span>100% Free & Open Access เข้าถึงได้ทุกคน</span>
          </div>
        </div>
      </section>

      {/* ---------- Numbers ---------- */}
      <section className="border-y bg-muted/30">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          {statItems.map((s, i) => (
            <Reveal key={s.label} delay={i * 80} className="flex flex-col-reverse text-center">
              <dt className="mt-1 text-sm text-muted-foreground">{s.label}</dt>
              <dd className="text-3xl font-bold tracking-tight sm:text-4xl">
                <AnimatedNumber value={s.value} />
              </dd>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="ขั้นตอน" title="เรียนจบใน 4 ขั้นตอน" description="ทุกหลักสูตรใช้เกณฑ์เดียวกัน ตั้งแต่ลงทะเบียนจนถึงรับใบรับรอง" />
        <div className="relative mt-12 grid gap-6 md:grid-cols-4">
          <div aria-hidden className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 100}>
              <div className="relative flex flex-col items-center text-center">
                <span className="relative flex h-12 w-12 items-center justify-center rounded-full border bg-background shadow-sm">
                  <s.icon className="h-5 w-5" />
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{i + 1}</span>
                </span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1 max-w-[16rem] text-sm text-muted-foreground">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 100} className="h-full">
              <SpotlightCard className="h-full rounded-xl">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Upcoming cohorts and announcements ---------- */}
      {(upcoming.length > 0 || announcements.length > 0) && (
        <section id="events" className="scroll-mt-20 border-t">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6">
            {upcoming.length > 0 && (
              <div>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <SectionHeading eyebrow="รอบอบรม" title="กิจกรรมที่กำลังจะเกิดขึ้น" align="left" />
                  <Link href="/programs" className={buttonClass("outline", "md", "group")}>
                    หลักสูตรอบรมทั้งหมด <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
                <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {upcoming.map((c) => <UpcomingCohortCard key={c.id} c={c} />)}
                </div>
              </div>
            )}
            {announcements.length > 0 && (
              <div>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <SectionHeading eyebrow="ประชาสัมพันธ์" title="ประกาศและข่าวสาร" align="left" />
                  <Link href="/announcements" className={buttonClass("outline", "md", "group")}>
                    ประกาศทั้งหมด <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
                <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {announcements.map((a) => <AnnouncementCard key={a.id} a={a} />)}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- Kinds of training (no single course is promoted here) ---------- */}
      <section id="courses" className="scroll-mt-20 border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading eyebrow="หลักสูตร" title="เลือกรูปแบบการอบรม" align="left" />
            {courses.length > 0 && (
              <Link href="/courses" className={buttonClass("outline", "md", "group")}>
                ดูหลักสูตรทั้งหมด {courses.length} หลักสูตร <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
          {courses.length === 0 ? (
            <div className="mt-10">
              <EmptyState icon={<BookOpen className="h-5 w-5" />} title="ยังไม่มีหลักสูตรที่เผยแพร่" />
            </div>
          ) : (
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {COURSE_TYPES.map((t, i) => {
                const info = COURSE_TYPE_INFO[t];
                const Icon = t === "short_course" ? Award : BadgeCheck;
                return (
                  <Reveal key={t} delay={i * 80}>
                    <Link
                      href={`/courses?type=${t}`}
                      className="group flex h-full flex-col gap-4 rounded-2xl border bg-card p-6 transition-[box-shadow,translate] hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                      </span>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold tracking-tight">{info.label}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                        {typeCounts[t] > 0 ? `ดู ${typeCounts[t]} หลักสูตร` : "ยังไม่มีหลักสูตรที่เปิด"}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ---------- Verify CTA ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal from="scale">
          <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-12 text-primary-foreground sm:px-12">
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 animate-float rounded-full bg-primary-foreground/10 blur-2xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 animate-float rounded-full bg-primary-foreground/5 blur-2xl [animation-delay:1.5s]" />
            <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/10">
                  <QrCode className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">ได้รับใบรับรองมา? ตรวจสอบได้ทันที</h2>
                  <p className="mt-1 text-primary-foreground/70">กรอกรหัสบนใบรับรอง หรือสแกน QR Code เพื่อดูสถานะและข้อมูลผู้สำเร็จการศึกษา</p>
                </div>
              </div>
              <Link
                href="/verify"
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-primary-foreground px-6 text-sm font-medium text-primary transition-[transform,opacity] hover:opacity-90 active:scale-[0.97]"
              >
                <ShieldCheck className="h-4 w-4" /> ตรวจสอบใบรับรอง
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="grid gap-2">
            <BrandLogo mode="hover" />
            <p className="text-sm text-muted-foreground">Minimalist Features, Maximum Integrity</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/courses" className="transition-colors hover:text-foreground">
              หลักสูตร
            </Link>
            <Link href="/verify" className="transition-colors hover:text-foreground">
              ตรวจสอบใบรับรอง
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              เข้าสู่ระบบ
            </Link>
            <Link href="/register" className="transition-colors hover:text-foreground">
              สมัครสมาชิก
            </Link>
          </nav>
        </div>
        <p className="border-t py-5 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} {BRAND_NAME}</p>
      </footer>
    </div>
  );
}

function Accent({ children }: { children: React.ReactNode }) {
  return <span className="bg-gradient-to-br from-primary via-primary to-primary/50 bg-clip-text text-transparent">{children}</span>;
}

function SectionHeading({ eyebrow, title, description, align = "center" }: { eyebrow: string; title: string; description?: string; align?: "center" | "left" }) {
  return (
    <Reveal className={align === "center" ? "mx-auto max-w-2xl text-center" : ""}>
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {description && <p className="mt-3 text-muted-foreground">{description}</p>}
    </Reveal>
  );
}

/** Interactive product preview: a lesson window with real-time telemetry and quick verification preview. */
function HeroVisual({ coverVideoId, title }: { coverVideoId: string | null; title: string }) {
  return (
    <div className="relative mx-auto w-full max-w-md animate-slide-up [animation-delay:200ms] [animation-fill-mode:both] lg:max-w-none">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/20 via-transparent to-primary/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border bg-card shadow-2xl transition hover:shadow-primary/5">
        <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
          <span className="ml-3 h-5 flex-1 rounded-md bg-background/80 text-[10px] text-muted-foreground flex items-center px-2">
            upskillreskill.rietc.ac.th / classroom
          </span>
        </div>
        <CourseCover videoId={coverVideoId} title={title} />
        <div className="grid gap-3 p-5">
          <p className="truncate font-semibold text-base">{title}</p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-success" />
              </span>
              กำลังบันทึกเวลาเรียน · ดูแล้ว 68%
            </span>
            <span className="font-mono text-[11px] tabular-nums">08:24 / 12:20</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-[68%] origin-left animate-[grow-x_1.6s_var(--ease-spring-smooth)_both] rounded-full bg-primary" />
          </div>
          <div className="mt-1 pt-2 border-t border-border/60 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">ผ่านเกณฑ์แล้ว 3 จาก 4 บท</span>
            <Link
              href="/verify"
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              ทดลองดูตัวอย่างระบบตรวจสอบใบรับรอง <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
      <Link
        href="/verify"
        className="absolute -right-3 -top-5 flex animate-float items-center gap-2 rounded-xl border bg-background/95 px-3.5 py-2.5 text-xs font-semibold shadow-lg backdrop-blur transition hover:scale-105 sm:-right-6"
      >
        <CircleCheck className="h-4 w-4 text-success" />
        <span>ใบรับรองดิจิทัล Ed25519</span>
      </Link>
      <div className="absolute -bottom-5 -left-3 flex animate-float items-center gap-2.5 rounded-xl border bg-background/95 px-3.5 py-2.5 text-xs shadow-lg backdrop-blur [animation-delay:1.2s] sm:-left-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">92%</span>
        <span>
          <span className="block text-[10px] text-muted-foreground">คะแนน Post-test</span>
          <span className="font-semibold text-success">ผ่านเกณฑ์มาตรฐาน</span>
        </span>
      </div>
    </div>
  );
}
