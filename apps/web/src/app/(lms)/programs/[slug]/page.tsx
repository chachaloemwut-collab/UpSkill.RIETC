import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, ChevronRight, Clock, Layers, ListChecks, Pencil, UserRound, Users } from "lucide-react";
import { Alert, Badge, Card, EmptyState, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { CohortApply } from "@/components/programs/CohortApply";
import { WatchCohortButton } from "@/components/programs/WatchCohortButton";
import { ProgramCertificateButton } from "@/components/programs/ProgramCertificateButton";
import { RichText } from "@/components/programs/RichText";
import { COHORT_PHASE, PROGRAM_VISIBILITY, REGISTRATION_STATUS, formatDateTimeTh, formatDuration } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getProgramForViewer } from "@/server/programs/programs.service";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProgramForViewer(slug, null);
  if (!data) return {};
  const description = data.program.summary ?? undefined;
  return { title: data.program.title, description, openGraph: { title: data.program.title, description, type: "website" } };
}

export default async function ProgramPage({ params }: Props) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const data = await getProgramForViewer(slug, user);
  if (!data) notFound();
  const { program, courses, cohorts, isAdmin, instructorOfProgram } = data;
  const totalSec = courses.reduce((n, c) => n + c.total_duration_sec, 0);
  const vis = PROGRAM_VISIBILITY[program.visibility];

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href="/programs" className="transition-colors hover:text-foreground">หลักสูตรอบรม</Link>
            <ChevronRight className="h-3.5 w-3.5" /> {program.category ?? "รายละเอียด"}
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {program.title}
            {program.visibility !== "published" && <Badge variant={vis?.variant ?? "secondary"}>{vis?.label ?? program.visibility}</Badge>}
          </span>
        }
        description={program.summary ?? undefined}
      >
        {isAdmin && (
          <Link href={`/admin/programs/${program.id}`} className={buttonClass("outline")}>
            <Pencil className="h-4 w-4" /> แก้ไขหลักสูตร
          </Link>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid min-w-0 content-start gap-6">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Layers className="h-4 w-4" /> {courses.length} รายวิชา</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> {formatDuration(totalSec)}</span>
          </div>

          {program.description && (
            <Card className="p-5 text-sm">
              <RichText text={program.description} />
            </Card>
          )}

          <section>
            <h2 className="mb-3 text-base font-semibold">รายวิชาในหลักสูตร</h2>
            {courses.length === 0 ? (
              <EmptyState icon={<Layers className="h-5 w-5" />} title="ยังไม่มีรายวิชา" />
            ) : (
              <Card className="divide-y">
                {courses.map((c, i) => (
                  <div key={c.id} className="flex items-start gap-4 p-4">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/courses/${c.slug}`} className="font-medium hover:underline">{c.title}</Link>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> {c.instructor_name}</span>
                        <span>{c.lesson_count} บท · {formatDuration(c.total_duration_sec)}</span>
                        {!c.is_required && <Badge variant="outline">วิชาเลือก</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">รอบอบรม</h2>
            </div>
            {cohorts.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">ยังไม่มีรอบอบรมที่เปิดประกาศ</p>
            ) : (
              <div className="divide-y">
                {cohorts.map((c) => {
                  const phase = COHORT_PHASE[c.phase];
                  const mine = c.myRegistration;
                  const reg = mine ? REGISTRATION_STATUS[mine.status] : null;
                  const canApply = c.phase === "open" && (!mine || mine.status === "cancelled") && !instructorOfProgram && c.ineligibleReasons.length === 0 && (c.seatsLeft !== 0 || c.waitlistEnabled);
                  const canWithdraw = !!mine && ["pending", "approved", "waitlisted"].includes(mine.status) && new Date(c.startsAt) > new Date();
                  return (
                    <div key={c.id} className="grid gap-3 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-medium">{c.title}</h3>
                        <Badge variant={phase?.variant ?? "secondary"}>{phase?.label ?? c.phase}</Badge>
                      </div>
                      <dl className="grid gap-1.5 text-sm">
                        <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted-foreground">รับสมัคร</dt><dd>{formatDateTimeTh(c.registrationOpensAt)} – {formatDateTimeTh(c.registrationClosesAt)}</dd></div>
                        <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted-foreground">อบรม</dt><dd>{formatDateTimeTh(c.startsAt)} – {formatDateTimeTh(c.endsAt)}</dd></div>
                        <div className="flex gap-2">
                          <dt className="w-24 shrink-0 text-muted-foreground">ที่นั่ง</dt>
                          <dd className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" />
                            {c.capacity === null ? "ไม่จำกัด" : `เหลือ ${c.seatsLeft} จาก ${c.capacity} ที่นั่ง`}
                            {c.capacity !== null && c.seatsLeft === 0 && c.waitlistEnabled && " (รับรายชื่อสำรอง)"}
                          </dd>
                        </div>
                        {c.requiresApproval && <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted-foreground">การคัดเลือก</dt><dd>ผู้ดูแลพิจารณาใบสมัคร</dd></div>}
                      </dl>
                      {c.requirements.length > 0 && (
                        <div className="rounded-lg bg-muted/50 p-3 text-sm">
                          <p className="mb-1.5 inline-flex items-center gap-1.5 font-medium"><ListChecks className="h-4 w-4" /> คุณสมบัติผู้สมัคร</p>
                          <ul className="grid gap-1">
                            {c.requirements.map((r) => <li key={r} className="flex gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {r}</li>)}
                          </ul>
                        </div>
                      )}
                      {mine && reg && mine.status !== "cancelled" && (
                        <Alert variant={mine.status === "approved" ? "success" : mine.status === "rejected" ? "destructive" : "default"} title={`สถานะการสมัคร: ${reg.label}`}>
                          {mine.status === "approved" && new Date(c.startsAt) > new Date() && `เริ่มเข้าเรียนได้ตั้งแต่ ${formatDateTimeTh(c.startsAt)}`}
                          {mine.note && `หมายเหตุ: ${mine.note}`}
                        </Alert>
                      )}
                      {mine?.status === "approved" && (
                        <div className="flex flex-wrap gap-2">
                          <ProgramCertificateButton programId={data.program.id} />
                        </div>
                      )}
                      {user && c.ineligibleReasons.length > 0 && (
                        <Alert variant="warning" title="คุณยังไม่ผ่านเงื่อนไขการสมัคร">
                          <ul className="list-disc pl-4">{c.ineligibleReasons.map((r) => <li key={r}>{r}</li>)}</ul>
                        </Alert>
                      )}
                      {instructorOfProgram && c.phase === "open" && <p className="text-xs text-muted-foreground">ผู้สอนในหลักสูตรนี้ไม่สามารถสมัครเป็นผู้เรียนได้</p>}
                      {c.phase === "open" && c.capacity !== null && c.seatsLeft === 0 && !c.waitlistEnabled && !mine && <p className="text-sm text-muted-foreground">ที่นั่งเต็มแล้ว</p>}
                      {(canApply || canWithdraw) && (
                        <div className="flex flex-wrap gap-2">
                          <CohortApply
                            cohortId={c.id}
                            loggedIn={!!user}
                            canApply={canApply}
                            canWithdraw={canWithdraw}
                            form={c.applicationForm}
                            label={c.seatsLeft === 0 ? "สมัครรายชื่อสำรอง" : "สมัครเข้าอบรม"}
                          />
                        </div>
                      )}
                      {c.phase === "scheduled" && (
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" /> เปิดรับสมัคร {formatDateTimeTh(c.registrationOpensAt)}</p>
                          {user && <WatchCohortButton cohortId={c.id} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
