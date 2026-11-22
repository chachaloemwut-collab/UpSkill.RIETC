import { buttonClass } from "@/components/ui";
import Link from "next/link";
import { ArrowRight, ChevronDown, QrCode } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_NAME } from "@/components/brand/states";
import { CertificatePreview } from "@/components/certificate/CertificatePreview";
import { VerifyCodeForm } from "@/components/certificate/VerifyCodeForm";
import { listPublishedCourses, publicStats } from "@/server/courses/courses.service";
import { getCertificateDisplay } from "@/server/system-settings.service";
import { listUpcomingCohorts } from "@/server/programs/programs.service";
import { listPublicAnnouncements } from "@/server/programs/announcements.service";
import { ANNOUNCEMENT_KIND, COHORT_PHASE, formatDateRangeTh, formatDateTh } from "@/lib/format";
import { cohortWhen } from "@/components/programs/ProgramCard";
import { COURSE_TYPES, COURSE_TYPE_INFO } from "@upskill/core/application";
import { DEFAULT_ISSUER_TH, type CertificateDisplay } from "@upskill/core/certificate-patterns";
import { LandingNav } from "./LandingNav";
import styles from "./landing.module.css";

const steps = [
  ["ลงทะเบียน", "เลือกหลักสูตร ตรวจสอบคุณสมบัติ และกรอกใบสมัครตามที่หลักสูตรกำหนด"],
  ["เรียนตามบทเรียน", "ศึกษาวิดีโอและสื่อประกอบ ดูเวลาเรียนที่บันทึกไว้ได้ในหน้าหลักสูตร"],
  ["ทำแบบทดสอบ", "ทำแบบประเมินตามลำดับและเกณฑ์ผ่านที่ผู้สอนกำหนด"],
  ["รับวุฒิบัตร", "เมื่อผ่านเกณฑ์ ดาวน์โหลดวุฒิบัตรจากบัญชีผู้เรียนได้"],
];

const questions = [
  ["ตรวจสอบวุฒิบัตรได้อย่างไร", "สแกน QR Code บนเอกสาร หรือกรอกรหัสวุฒิบัตรในหน้าตรวจสอบ เพื่อดูข้อมูลผู้ได้รับ หลักสูตร วันที่ออก และสถานะล่าสุด"],
  ["ระบบนับเวลาเรียนวิดีโออย่างไร", "ระบบบันทึกช่วงวิดีโอที่รับชมตามเงื่อนไขของบทเรียน ช่วงที่กรอข้ามและช่วงที่เปิดซ้ำพร้อมกันหลายแท็บจะไม่นับเวลาเพิ่ม"],
  ["ต้องได้คะแนนเท่าไรจึงจะผ่าน", "ผู้สอนกำหนดเวลาเรียนขั้นต่ำและเกณฑ์คะแนนของแต่ละหลักสูตร ตรวจสอบรายละเอียดได้ก่อนลงทะเบียน"],
  ["ดาวน์โหลดเอกสารได้ที่ไหน", "เมื่อผ่านเกณฑ์ของหลักสูตรและระบบออกเอกสารแล้ว ให้เข้าสู่ระบบและเลือกเมนูวุฒิบัตรของฉัน"],
];

function DocumentSample({ display, small = false }: { display: CertificateDisplay; small?: boolean }) {
  return <CertificatePreview align="center" template={small ? "classic" : "royal"} documentType="completion"
    courseTitle={small ? "การพัฒนาทักษะวิชาชีพ" : "การประยุกต์ใช้เทคโนโลยีดิจิทัลในการจัดการเรียนรู้"}
    display={display} />;
}

function More({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link className={styles.more} href={href}>{children}<ArrowRight size={16} aria-hidden /></Link>;
}

function FooterLinks({ title, links }: { title: string; links: [string, string][] }) {
  return <nav aria-label={title}><h3>{title}</h3>{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>;
}

export async function LandingPage() {
  const [courses, stats, upcoming, announcements, display] = await Promise.all([
    listPublishedCourses(), publicStats(), listUpcomingCohorts(3), listPublicAnnouncements({ limit: 3 }), getCertificateDisplay(),
  ]);
  const hours = stats.durationSec >= 36_000;
  const numbers = [
    ["หลักสูตรที่เผยแพร่", stats.courses], ["บทเรียนวิดีโอ", stats.lessons],
    [hours ? "ชั่วโมงของเนื้อหา" : "นาทีของเนื้อหา", Math.round(stats.durationSec / (hours ? 3600 : 60))],
    ["เอกสารที่ออกแล้ว", stats.certificates],
  ] as const;
  const counts = { certified_training: stats.certifiedTraining, short_course: stats.shortCourses };
  const hasEvents = upcoming.length > 0 || announcements.length > 0;

  return (
    <div className={styles.page}>
      <LandingNav hasEvents={hasEvents} />
      <main>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroGrid}>
            <div>
              <p className={styles.college}>{DEFAULT_ISSUER_TH}</p>
              <h1 id="home-title" className={styles.masthead} lang="en">Upskill.<br /><span>Reskill.</span></h1>
              <p className={styles.intro}>ระบบอบรมเพื่อพัฒนาทักษะวิชาชีพ</p>
              <p className={styles.lead}>เลือกหลักสูตรของวิทยาลัย เรียนตามบทเรียน และตรวจสอบผลการอบรมของตนเองได้ในที่เดียว</p>
              <div className={styles.actions}>
                <Link href="/courses" className={buttonClass("default", "lg")}>ดูหลักสูตรทั้งหมด <ArrowRight size={17} aria-hidden /></Link>
                <Link href="/verify" className={buttonClass("outline", "lg")}><QrCode size={17} aria-hidden /> ตรวจสอบเอกสาร</Link>
              </div>
              <dl className={styles.numbers}>{numbers.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value.toLocaleString("th-TH")}</dd></div>
              ))}</dl>
            </div>
            <figure className={styles.document}>
              <div className={styles.mount}><DocumentSample display={display} /></div>
              <figcaption><span>ตัวอย่างวุฒิบัตรของวิทยาลัย</span><span>A4 · PDF</span></figcaption>
            </figure>
          </div>
        </section>

        <section id="how" className={styles.band}>
          <div className={styles.container}>
            <h2 className={styles.center}>ขั้นตอนการเรียนและรับวุฒิบัตร</h2>
            <ol className={styles.steps}>{steps.map(([title, body], i) => (
              <li key={title}><span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></li>
            ))}</ol>
          </div>
        </section>

        <section className={styles.container} aria-labelledby="study-records">
          <h2 id="study-records" className={styles.center}>การบันทึกผลและการรับรอง</h2>
          <div className={styles.records}>
            <article className={styles.recordWide}>
              <div><h3>ตรวจสอบวุฒิบัตรจากทะเบียน</h3><p>รหัสประจำฉบับและ QR Code เชื่อมไปยังข้อมูลที่วิทยาลัยรับรอง เพื่อเทียบชื่อ หลักสูตร และสถานะของเอกสาร</p></div>
              <div aria-hidden="true" className={styles.miniDocument}><DocumentSample small display={display} /></div>
            </article>
            <article><h3>เวลาเรียนที่บันทึก</h3><p>ระบบนับช่วงที่รับชมวิดีโอตามเงื่อนไขของบทเรียน และตัดช่วงเวลาที่ซ้ำกันออก</p></article>
            <article><h3>ความก้าวหน้าของผู้เรียน</h3><p>ตรวจสอบบทเรียนที่เรียนจบ ผลประเมิน และรายการที่ต้องทำต่อได้ในหน้าหลักสูตร</p></article>
            <article className={styles.recordWide}><div><h3>เกณฑ์การสำเร็จหลักสูตร</h3><p>ผู้สอนระบุลำดับบทเรียนและเกณฑ์ประเมินไว้ในรายละเอียดหลักสูตร ผู้เรียนเปิดทบทวนเงื่อนไขได้ตั้งแต่ก่อนสมัคร</p></div></article>
          </div>
        </section>

        <section id="courses" className={styles.band}>
          <div className={styles.container}>
            <div className={styles.headingRow}><h2>เลือกรูปแบบการอบรม</h2>{courses.length > 0 && <More href="/courses">ทั้งหมด {courses.length} หลักสูตร</More>}</div>
            {courses.length ? (
              <div className={styles.catalogue}>{COURSE_TYPES.map((type) => (
                <Link href={`/courses?type=${type}`} key={type}>
                  <h3>{COURSE_TYPE_INFO[type].label}</h3><p>{COURSE_TYPE_INFO[type].description}</p>
                  <span>{counts[type] ? `ดู ${counts[type]} หลักสูตร` : "ยังไม่มีหลักสูตรที่เปิด"} <ArrowRight size={16} aria-hidden /></span>
                </Link>
              ))}</div>
            ) : <p className={styles.empty}>ยังไม่มีหลักสูตรที่เผยแพร่</p>}
          </div>
        </section>

        {hasEvents && <section id="events" className={styles.container}>
          {!!upcoming.length && <div>
            <div className={styles.headingRow}><h2>กิจกรรมที่กำลังจะเกิดขึ้น</h2><More href="/programs">หลักสูตรอบรมทั้งหมด</More></div>
            <div className={styles.notices}>{upcoming.map((c) => (
              <Link href={`/programs/${c.program_slug}`} key={c.id}>
                <span className={styles.date}>{formatDateTh(c.starts_at)} · {COHORT_PHASE[c.phase]?.label}</span><h3>{c.program_title}</h3><p>{c.title}</p>
                <small>{cohortWhen({ phase: c.phase, registrationOpensAt: c.registration_opens_at, registrationClosesAt: c.registration_closes_at, startsAt: c.starts_at })}</small>
              </Link>
            ))}</div>
          </div>}
          {!!announcements.length && <div>
            <div className={styles.headingRow}><h2>ประกาศและข่าวสาร</h2><More href="/announcements">ประกาศทั้งหมด</More></div>
            <div className={styles.notices}>{announcements.map((a) => (
              <Link href={`/announcements/${a.slug}`} key={a.id}>
                <span className={styles.date}>{formatDateTh(a.publish_at)} · {ANNOUNCEMENT_KIND[a.kind] ?? a.kind}{a.is_pinned && " · ปักหมุด"}</span>
                <h3>{a.title}</h3>{a.summary && <p>{a.summary}</p>}
                {a.event_starts_at && <small>{formatDateRangeTh(a.event_starts_at, a.event_ends_at)}</small>}{a.location && <small>{a.location}</small>}
              </Link>
            ))}</div>
          </div>}
        </section>}

        <section id="verify" className={styles.support}>
          <div className={styles.supportGrid}>
            <div className={styles.verifyPanel}><h2>ตรวจสอบวุฒิบัตร</h2><p>กรอกรหัสที่พิมพ์บนเอกสาร เพื่อดูข้อมูลผู้ได้รับและสถานะล่าสุดจากทะเบียน</p><VerifyCodeForm autoFocus={false} /></div>
            <div><h2>คำถามก่อนเริ่มเรียน</h2><div className={styles.faq}>{questions.map(([q, a]) => (
              <details key={q}><summary>{q}<ChevronDown size={17} aria-hidden /></summary><p>{a}</p></details>
            ))}</div></div>
          </div>
        </section>

        <section className={styles.closing}>
          <h2>สมัครเข้าอบรมกับวิทยาลัย</h2>
          <div className={styles.actions}><Link href="/register" className={buttonClass("default", "lg")}>สร้างบัญชีผู้เรียน</Link><Link href="/courses" className={buttonClass("outline", "lg")}>ดูหลักสูตรทั้งหมด</Link></div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerGrid}>
          <div><BrandLogo /><p>{DEFAULT_ISSUER_TH}<br />ระบบอบรมเพื่อพัฒนาทักษะวิชาชีพ</p></div>
          <FooterLinks title="การอบรม" links={[[ "/courses", "หลักสูตรทั้งหมด"], ["/programs", "หลักสูตรอบรม"], ["/announcements", "ประกาศและข่าวสาร"]]} />
          <FooterLinks title="บัญชีและเอกสาร" links={[[ "/login", "เข้าสู่ระบบ"], ["/register", "สมัครสมาชิก"], ["/verify", "ตรวจสอบเอกสาร"], ["/privacy", "นโยบายความเป็นส่วนตัว"]]} />
        </div>
        <p className={styles.copyright}>© {new Date().getFullYear()} {BRAND_NAME}</p>
      </footer>
    </div>
  );
}
