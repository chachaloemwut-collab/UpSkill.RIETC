import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Alert, Badge, Card, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { CohortStatusActions, EditCohortForm, ShiftDatesButton } from "@/components/admin/programs/CohortForm";
import { RegistrationsTable } from "@/components/admin/programs/RegistrationsTable";
import { COHORT_PHASE, formatDateTimeTh } from "@/lib/format";
import { ctx } from "@/server/context";
import { getCohortForAdmin } from "@/server/programs/cohorts.service";
import { or404, requireAdminPage, uuidOr404 } from "@/server/programs/admin-page";
import { CalendarClock, Clock3, GraduationCap, UserCheck, Users } from "lucide-react";

export const metadata: Metadata = { title: "รอบอบรม", robots: { index: false } };

export default async function AdminCohortPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const id = uuidOr404((await params).id);
  const { cohort, program, registrations, taken, completion } = await or404(getCohortForAdmin(user, id));
  const { db } = ctx();
  const [groups, courses] = await Promise.all([
    db.selectFrom("learning_groups").select(["id", "name"]).orderBy("name").limit(500).execute(),
    db.selectFrom("courses").select(["id", "title as name"]).where("visibility", "<>", "suspended").orderBy("title").limit(1000).execute(),
  ]);
  const phase = COHORT_PHASE[cohort.phase];
  const count = (s: string) => registrations.filter((r) => r.status === s).length;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-1.5">
            <Link href="/admin/programs" className="hover:text-foreground">หลักสูตรอบรม</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/admin/programs/${program.id}`} className="hover:text-foreground">{program.title}</Link>
            <ChevronRight className="h-3.5 w-3.5" /> รอบอบรม
          </span>
        }
        title={<span className="flex flex-wrap items-center gap-3">{cohort.title}<Badge variant={phase?.variant ?? "secondary"}>{phase?.label ?? cohort.phase}</Badge></span>}
        description={`รับสมัคร ${formatDateTimeTh(cohort.registration_opens_at)} – ${formatDateTimeTh(cohort.registration_closes_at)} · อบรม ${formatDateTimeTh(cohort.starts_at)} – ${formatDateTimeTh(cohort.ends_at)}`}
      >
        {cohort.status !== "cancelled" && <ShiftDatesButton cohortId={cohort.id} />}
        <CohortStatusActions cohortId={cohort.id} status={cohort.status} />
      </PageHeader>

      {cohort.status === "draft" && (
        <div className="mb-4"><Alert title="รอบนี้ยังเป็นฉบับร่าง">ผู้ใช้ยังมองไม่เห็นรอบนี้ ตรวจสอบวันที่และเงื่อนไขแล้วกด “เผยแพร่รอบ”</Alert></div>
      )}
      {cohort.status === "cancelled" && <div className="mb-4"><Alert variant="destructive" title="รอบนี้ถูกยกเลิกแล้ว" /></div>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard index={0} label="ที่นั่งที่ใช้" value={taken} unit={cohort.capacity === null ? "คน (ไม่จำกัด)" : `/ ${cohort.capacity}`} icon={<Users />} />
        <StatCard index={1} label="อนุมัติแล้ว" value={count("approved")} unit="คน" icon={<UserCheck />} />
        <StatCard index={2} label="รอพิจารณา" value={count("pending")} unit="คน" icon={<Clock3 />} />
        <StatCard index={3} label="รายชื่อสำรอง" value={count("waitlisted")} unit="คน" icon={<CalendarClock />} />
        <StatCard index={4} label="จบทุกวิชาบังคับ" value={completion.completed} unit={`/ ${completion.required} วิชา`} icon={<GraduationCap />} />
      </div>

      <Tabs defaultValue="registrations" className="mt-6">
        <TabsList>
          <TabsTrigger value="registrations">ผู้สมัคร ({registrations.length})</TabsTrigger>
          <TabsTrigger value="settings">ตั้งค่ารอบ</TabsTrigger>
        </TabsList>
        <TabsContent value="registrations" className="mt-4">
          <Card className="p-5">
            <RegistrationsTable
              cohortId={cohort.id}
              registrations={registrations}
              form={cohort.rules.applicationForm.map((f) => ({ key: f.key, label: f.label }))}
              cancelled={cohort.status === "cancelled"}
            />
          </Card>
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <Card className="p-5">
            {cohort.status === "cancelled" ? (
              <p className="text-sm text-muted-foreground">รอบที่ยกเลิกแล้วแก้ไขไม่ได้</p>
            ) : (
              <EditCohortForm
                cohortId={cohort.id}
                defaults={{ ...cohort, rules: cohort.rules }}
                groups={groups}
                courses={courses.map((c) => ({ id: c.id, name: c.name }))}
              />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
