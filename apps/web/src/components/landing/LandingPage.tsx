import Link from "next/link";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Gauge,
  PlayCircle,
  QrCode,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { AnimatedNumber, EmptyState, Reveal, SpotlightCard, buttonClass } from "@/components/ui";
import { BRAND_NAME, BrandLogo } from "@/components/brand/BrandLogo";
import { CertificatePreview } from "@/components/certificate/CertificatePreview";
import { VerifyCodeForm } from "@/components/certificate/VerifyCodeForm";
import { listPublishedCourses, publicStats } from "@/server/courses/courses.service";
import { getCertificateDisplay } from "@/server/system-settings.service";
import { listUpcomingCohorts } from "@/server/programs/programs.service";
import { listPublicAnnouncements } from "@/server/programs/announcements.service";
import { AnnouncementCard } from "@/components/programs/AnnouncementCard";
import { UpcomingCohortCard } from "@/components/programs/UpcomingCohortCard";
import { LandingNav } from "./LandingNav";
import type { CertificateDisplay } from "@upskill/core/certificate-patterns";
import { COURSE_TYPES, COURSE_TYPE_INFO } from "@upskill/core/application";

const STEPS = [
  { icon: UserPlus, title: "สมัครและลงทะเบียน", text: "สร้างบัญชี เลือกหลักสูตร และกรอกใบสมัครเมื่อหลักสูตรกำหนด" },
  { icon: PlayCircle, title: "เรียนจากวิดีโอ", text: "ระบบบันทึกเวลาเรียนจริงของแต่ละบทจากฝั่งเซิร์ฟเวอร์" },
  { icon: ClipboardCheck, title: "ทำแบบทดสอบ", text: "ทำแบบทดสอบตามเกณฑ์ที่เจ้าของหลักสูตรกำหนด" },
  { icon: Award, title: "รับวุฒิบัตร", text: "ไฟล์ PDF ลงนามดิจิทัล ตรวจสอบสถานะได้ด้วย QR Code" },
];

const FAQ = [
  {
    q: "ตรวจสอบวุฒิบัตรได้อย่างไร",
    a: "สแกน QR Code บนเอกสาร หรือกรอกรหัสเอกสารในหน้าตรวจสอบ ระบบจะแสดงชื่อผู้ได้รับ หลักสูตร วันที่ออก และสถานะว่ายังใช้ได้หรือถูกเพิกถอนแล้ว",
  },
  {
    q: "ทำไมกรอวิดีโอข้ามหรือเร่งความเร็วแล้วเวลาเรียนไม่เพิ่ม",
    a: "ระบบนับเฉพาะช่วงที่ดูจริงจากฝั่งเซิร์ฟเวอร์ ช่วงที่กรอข้าม เร่งความเร็ว หรือเปิดเรียนซ้ำหลายแท็บจะไม่ถูกนับ เพื่อให้เวลาเรียนบนวุฒิบัตรเชื่อถือได้",
  },
  {
    q: "ต้องได้คะแนนเท่าไรจึงจะผ่าน",
    a: "เจ้าของหลักสูตรเป็นผู้กำหนดเกณฑ์ เช่น สัดส่วนการดูวิดีโอขั้นต่ำและคะแนนแบบทดสอบที่ผ่าน ดูเกณฑ์ได้ในหน้ารายละเอียดของแต่ละหลักสูตร",
  },
  {
    q: "ได้รับเอกสารเมื่อไร และดาวน์โหลดที่ไหน",
    a: "เมื่อผ่านเกณฑ์ครบ ระบบจะออกเอกสารให้อัตโนมัติและแจ้งทางอีเมล ดาวน์โหลดไฟล์ PDF ได้ทุกเมื่อจากเมนูวุฒิบัตรของฉัน",
  },
];

/** Public landing page for visitors who are not signed in. */
export async function LandingPage() {
  const [courses, stats, upcoming, announcements, certificateDisplay] = await Promise.all([listPublishedCourses(), publicStats(), listUpcomingCohorts(3), listPublicAnnouncements({ limit: 3 }), getCertificateDisplay()]);
  // The landing page promotes no single course: it presents the kinds of training on offer
  const typeCounts = { certified_training: stats.certifiedTraining, short_course: stats.shortCourses } as const;
  const longContent = stats.durationSec >= 10 * 3600;
  const statItems = [
    { label: "หลักสูตรที่เผยแพร่", value: stats.courses },
    { label: "บทเรียนวิดีโอ", value: stats.lessons },
    { label: longContent ? "ชั่วโมงของเนื้อหา" : "นาทีของเนื้อหา", value: Math.round(stats.durationSec / (longContent ? 3600 : 60)) },
    { label: "เอกสารที่ออกแล้ว", value: stats.certificates },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <LandingNav />

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_15%_0%,hsl(var(--primary)/0.12),transparent_70%),radial-gradient(45%_45%_at_95%_20%,hsl(var(--streak)/0.10),transparent_70%)]" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.6)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.6)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-10 lg:pb-24 lg:pt-20">
          <div className="text-center lg:text-left">
            <span className="inline-flex animate-slide-up items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur [animation-fill-mode:both]">
              <BadgeCheck className="h-3.5 w-3.5 text-primary" />
              ระบบเรียนออนไลน์ พร้อมเอกสารรับรองที่ตรวจสอบได้
            </span>
            <h1 className="mt-6 animate-slide-up text-5xl font-bold leading-[1.05] tracking-tight [animation-delay:80ms] [animation-fill-mode:both] sm:text-6xl lg:text-7xl">
              <span className="bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">Upskill.</span>
              <br />
              Reskill.
            </h1>
            <p className="mt-5 animate-slide-up text-xl font-medium text-foreground/85 [animation-delay:160ms] [animation-fill-mode:both] sm:text-2xl">
              เรียนจากวิดีโอ ทำแบบทดสอบ แล้วรับวุฒิบัตรที่ใครก็ตรวจสอบได้
            </p>
            <p className="mx-auto mt-3 max-w-xl animate-slide-up font-reading text-muted-foreground [animation-delay:240ms] [animation-fill-mode:both] lg:mx-0">
              ระบบบันทึกเวลาเรียนจริงของทุกบท และออกเอกสาร PDF ลงนามดิจิทัลพร้อม QR Code สำหรับตรวจสอบสถานะออนไลน์
            </p>
            <div className="mt-8 flex animate-slide-up flex-col justify-center gap-3 [animation-delay:320ms] [animation-fill-mode:both] sm:flex-row lg:justify-start">
              <Link href="/courses" className={buttonClass("default", "lg", "group h-12 px-7 text-base shadow-md shadow-primary/20")}>
                ดูหลักสูตรทั้งหมด <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="/verify" className={buttonClass("outline", "lg", "h-12 bg-background/70 px-7 text-base")}>
                <QrCode className="h-4 w-4" /> ตรวจสอบเอกสาร
              </Link>
            </div>
            <dl className="mt-10 grid animate-slide-up grid-cols-2 gap-x-6 gap-y-5 border-t pt-6 [animation-delay:400ms] [animation-fill-mode:both] sm:grid-cols-4">
              {statItems.map((s) => (
                <div key={s.label} className="flex flex-col-reverse text-center lg:text-left">
                  <dt className="mt-0.5 text-xs text-muted-foreground">{s.label}</dt>
                  <dd className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                    <AnimatedNumber value={s.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <HeroVisual display={certificateDisplay} />
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="scroll-mt-20 border-y bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="ขั้นตอน" title="จากบทเรียนแรก ถึงวุฒิบัตร" description="ทุกหลักสูตรใช้ลำดับเดียวกัน ตั้งแต่ลงทะเบียนจนถึงรับเอกสาร" />
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 90} className="h-full">
                <li className="relative flex h-full flex-col rounded-2xl border bg-card p-6 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <s.icon className="h-5 w-5" />
                    </span>
                    <span className="font-mono text-3xl font-bold text-muted-foreground/25">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 font-semibold">{s.title}</h3>
                  <p className="mt-1.5 font-reading text-sm text-muted-foreground">{s.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Why trust it ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="ความน่าเชื่อถือ" title="เวลาเรียนจริง คะแนนจริง เอกสารที่ปลอมไม่ได้" />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          <Reveal className="h-full lg:col-span-2">
            <SpotlightCard className="h-full rounded-2xl">
              <div className="grid h-full gap-6 sm:grid-cols-[1fr_1.1fr] sm:items-center">
                <div>
                  <FeatureIcon icon={ShieldCheck} />
                  <h3 className="mt-5 text-lg font-semibold">ลงนามดิจิทัลและตรวจสอบได้ทุกฉบับ</h3>
                  <p className="mt-2 font-reading text-sm leading-relaxed text-muted-foreground">
                    เอกสารทุกฉบับลงนามด้วย Ed25519 พร้อมรหัสและ QR Code หากข้อมูลถูกแก้ไขหรือเอกสารถูกเพิกถอน หน้าตรวจสอบจะแสดงผลทันที
                  </p>
                </div>
                <div className="rounded-xl border bg-background p-3 shadow-sm">
                  <CertificatePreview
                    template="royal"
                    align="center"
                    documentType="completion"
                    documentName="วุฒิบัตร"
                                        courseTitle="ตัวอย่างหลักสูตร"
                    signerName="ผู้อำนวยการสถาบัน"
                    signerTitle="ผู้ลงนาม"
                    display={certificateDisplay}
                  />
                </div>
              </div>
            </SpotlightCard>
          </Reveal>
          <Reveal delay={90} className="h-full">
            <SpotlightCard className="h-full rounded-2xl">
              <FeatureIcon icon={Clock} />
              <h3 className="mt-5 text-lg font-semibold">นับเฉพาะเวลาที่เรียนจริง</h3>
              <p className="mt-2 font-reading text-sm leading-relaxed text-muted-foreground">
                ตรวจช่วงเวลาที่ดูจากฝั่งเซิร์ฟเวอร์ ไม่นับช่วงที่กรอข้าม เร่งความเร็ว หรือเปิดเรียนซ้ำหลายแท็บ
              </p>
              <div className="mt-6 grid gap-2 text-xs">
                <TrackRow label="ดูวิดีโอปกติ" value="นับเวลา" ok />
                <TrackRow label="กรอข้ามช่วง" value="ไม่นับ" />
                <TrackRow label="เปิดซ้ำหลายแท็บ" value="ไม่นับ" />
              </div>
            </SpotlightCard>
          </Reveal>
          <Reveal delay={60} className="h-full">
            <SpotlightCard className="h-full rounded-2xl">
              <FeatureIcon icon={Gauge} />
              <h3 className="mt-5 text-lg font-semibold">เห็นความคืบหน้าตลอดเส้นทาง</h3>
              <p className="mt-2 font-reading text-sm leading-relaxed text-muted-foreground">
                หน้าหลักสูตรแสดงบทเรียน ความคืบหน้า ผลการประเมิน และสถานะเอกสารในลำดับเดียวกัน
              </p>
            </SpotlightCard>
          </Reveal>
          <Reveal delay={120} className="h-full lg:col-span-2">
            <SpotlightCard className="h-full rounded-2xl">
              <div className="flex h-full flex-col gap-6 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <FeatureIcon icon={BookOpen} />
                  <h3 className="mt-5 text-lg font-semibold">หลักสูตรจัดเป็นบท พร้อมแบบทดสอบ</h3>
                  <p className="mt-2 font-reading text-sm leading-relaxed text-muted-foreground">
                    เรียนตามลำดับที่ผู้สอนวางไว้ มีแบบทดสอบท้ายบทหรือท้ายหลักสูตร และเกณฑ์ผ่านที่ประกาศชัดเจนก่อนเริ่มเรียน
                  </p>
                </div>
                <div className="grid flex-1 gap-2">
                  {["บทที่ 1 · ปูพื้นฐาน", "บทที่ 2 · ลงมือปฏิบัติ", "แบบทดสอบท้ายหลักสูตร"].map((t, i) => (
                    <div key={t} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm">
                      <span className={i < 2 ? "flex h-5 w-5 items-center justify-center rounded-full bg-success text-[10px] text-white" : "flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary"}>
                        {i < 2 ? "✓" : ""}
                      </span>
                      <span className="flex-1">{t}</span>
                      <span className="text-xs text-muted-foreground">{i < 2 ? "ผ่านแล้ว" : "พร้อมทำ"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SpotlightCard>
          </Reveal>
        </div>
      </section>

      {/* ---------- Kinds of training (no single course is promoted here) ---------- */}
      <section id="courses" className="scroll-mt-20 border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading eyebrow="หลักสูตร" title="เลือกรูปแบบการอบรม" align="left" />
            {courses.length > 0 && (
              <Link href="/courses" className={buttonClass("outline", "md", "group")}>
                ดูทั้งหมด {courses.length} หลักสูตร <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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
                      className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-7 transition-[box-shadow,translate,border-color] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span aria-hidden className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/5 transition-transform duration-500 group-hover:scale-125" />
                      <span className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                        <Icon className="h-6 w-6" />
                      </span>
                      <div className="relative flex-1">
                        <h3 className="text-xl font-semibold tracking-tight">{info.label}</h3>
                        <p className="mt-1.5 font-reading text-sm text-muted-foreground">{info.description}</p>
                      </div>
                      <span className="relative inline-flex items-center gap-1.5 text-sm font-medium text-primary">
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

      {/* ---------- Upcoming cohorts and announcements ---------- */}
      {(upcoming.length > 0 || announcements.length > 0) && (
        <section id="events" className="scroll-mt-20 border-t">
          <div className="mx-auto grid max-w-6xl gap-16 px-4 py-20 sm:px-6">
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

      {/* ---------- Verify + FAQ ---------- */}
      <section id="verify" className="scroll-mt-20 border-t">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
          <Reveal from="scale">
            <div className="relative h-full overflow-hidden rounded-2xl bg-primary p-7 text-primary-foreground sm:p-9">
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary-foreground/10 blur-2xl" />
              <span className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-primary-foreground/15">
                <QrCode className="h-6 w-6" />
              </span>
              <h2 className="relative mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">ได้รับเอกสารมา? ตรวจสอบได้ทันที</h2>
              <p className="relative mt-2 font-reading text-primary-foreground/80">กรอกรหัสบนเอกสาร หรือสแกน QR Code เพื่อดูสถานะและข้อมูลผู้ได้รับ</p>
              <div className="relative mt-6 rounded-xl bg-background p-5 text-foreground shadow-lg">
                <VerifyCodeForm autoFocus={false} />
              </div>
            </div>
          </Reveal>
          <div>
            <SectionHeading eyebrow="คำถามที่พบบ่อย" title="ก่อนเริ่มเรียน" align="left" />
            <div className="mt-8 divide-y rounded-2xl border bg-card">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium transition-colors hover:text-primary">
                    {f.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
                  </summary>
                  <p className="pb-5 font-reading text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Closing CTA ---------- */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">พร้อมเริ่มบทเรียนแรกแล้วหรือยัง</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className={buttonClass("default", "lg", "h-12 px-7 text-base")}>
              สร้างบัญชีผู้เรียน
            </Link>
            <Link href="/courses" className={buttonClass("outline", "lg", "h-12 bg-background px-7 text-base")}>
              ดูหลักสูตรก่อน
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="grid content-start gap-3">
            <BrandLogo mode="hover" />
            <p className="max-w-xs font-reading text-sm text-muted-foreground">ระบบเรียนออนไลน์ที่บันทึกเวลาเรียนจริง และออกเอกสารรับรองที่ตรวจสอบได้</p>
          </div>
          <FooterColumn
            title="เรียน"
            links={[
              ["/courses", "หลักสูตรทั้งหมด"],
              ["/programs", "หลักสูตรอบรม"],
              ["/announcements", "ประกาศและข่าวสาร"],
            ]}
          />
          <FooterColumn
            title="บัญชีและเอกสาร"
            links={[
              ["/login", "เข้าสู่ระบบ"],
              ["/register", "สมัครสมาชิก"],
              ["/verify", "ตรวจสอบเอกสาร"],
              ["/privacy", "นโยบายความเป็นส่วนตัว"],
            ]}
          />
        </div>
        <p className="border-t py-5 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} {BRAND_NAME}</p>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description, align = "center" }: { eyebrow: string; title: string; description?: string; align?: "center" | "left" }) {
  return (
    <Reveal className={align === "center" ? "mx-auto max-w-2xl text-center" : ""}>
      <p className="text-sm font-semibold tracking-wide text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {description && <p className="mt-3 font-reading text-muted-foreground">{description}</p>}
    </Reveal>
  );
}

function FeatureIcon({ icon: Icon }: { icon: typeof ShieldCheck }) {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <Icon className="h-5 w-5" />
    </span>
  );
}

function TrackRow({ label, value, ok = false }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
      <span>{label}</span>
      <span className={ok ? "font-medium text-success" : "font-medium text-muted-foreground line-through decoration-destructive/60"}>{value}</span>
    </div>
  );
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <nav aria-label={title} className="grid content-start gap-2.5 text-sm">
      <p className="font-semibold">{title}</p>
      {links.map(([href, label]) => (
        <Link key={href} href={href} className="text-muted-foreground transition-colors hover:text-foreground">
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Product composition: the actual certificate artwork behind a lesson-progress card. */
function HeroVisual({ display }: { display: CertificateDisplay }) {
  return (
    <div className="relative mx-auto w-full max-w-xl animate-slide-up pb-10 [animation-delay:200ms] [animation-fill-mode:both] lg:max-w-none">
      <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-primary/15 via-transparent to-streak/10 blur-2xl" />
      <div className="relative rotate-[1.5deg] rounded-xl border bg-card p-2.5 shadow-2xl transition-transform duration-700 hover:rotate-0">
        <CertificatePreview
          template="standard"
          align="center"
          documentType="completion"
          documentName="วุฒิบัตร"
                    courseTitle="การประยุกต์ใช้ AI เพื่อการเรียนการสอน"
          signerName="ผู้อำนวยการสถาบัน"
          signerTitle="ผู้ลงนาม"
          display={display}
        />
      </div>

      <div className="absolute -bottom-4 left-0 w-64 animate-float rounded-xl border bg-background/95 p-4 shadow-xl backdrop-blur sm:-left-6 sm:w-72 lg:-bottom-10 lg:-left-12">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-success" />
          </span>
          กำลังบันทึกเวลาเรียน
          <span className="ml-auto font-mono tabular-nums">08:24 / 12:20</span>
        </div>
        <p className="mt-2 truncate text-sm font-semibold">บทที่ 3 · ลงมือใช้งานจริง</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-[68%] origin-left animate-[grow-x_1.6s_var(--ease-spring-smooth)_both] rounded-full bg-primary" />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">ผ่านเกณฑ์แล้ว 3 จาก 4 บท</p>
      </div>

      <div className="absolute -top-4 right-2 flex animate-float items-center gap-2.5 rounded-xl border bg-background/95 px-3.5 py-2.5 text-xs shadow-lg backdrop-blur [animation-delay:1.2s] sm:-right-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/15 text-success">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-[10px] text-muted-foreground">ตรวจสอบเอกสาร</span>
          <span className="font-semibold text-success">ถูกต้อง · ลงนาม Ed25519</span>
        </span>
      </div>
    </div>
  );
}
