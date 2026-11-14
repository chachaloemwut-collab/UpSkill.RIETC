import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, ExternalLink } from "lucide-react";
import { Badge, Card, EmptyState, Table, Tabs, TabsContent, TabsList, TabsTrigger, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { ProgramCoursesEditor, ProgramInfoForm, ProgramPublishActions } from "@/components/admin/programs/ProgramActions";
import { CreateCohortDialog } from "@/components/admin/programs/CohortForm";
import { COHORT_PHASE, PROGRAM_VISIBILITY, formatDateTimeTh } from "@/lib/format";
import { getProgramForAdmin } from "@/server/programs/programs.service";
import { or404, requireAdminPage, uuidOr404 } from "@/server/programs/admin-page";

export const metadata: Metadata = { title: "แก้ไขหลักสูตรอบรม", robots: { index: false } };

export default async function AdminProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const id = uuidOr404((await params).id);
  const { program, courses, cohorts, allCourses, groups, publishProblems } = await or404(getProgramForAdmin(user, id));
  const vis = PROGRAM_VISIBILITY[program.visibility];
  const options = { groups: groups.map((g) => ({ id: g.id, name: g.name })), courses: allCourses.map((c) => ({ id: c.id, name: c.title })) };

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href="/admin/programs" className="hover:text-foreground">หลักสูตรอบรม</Link>
            <ChevronRight className="h-3.5 w-3.5" /> แก้ไข
          </span>
        }
        title={<span className="flex flex-wrap items-center gap-3">{program.title}<Badge variant={vis?.variant ?? "secondary"}>{vis?.label ?? program.visibility}</Badge></span>}
        description="ข้อมูลหลักสูตร รายวิชา รอบอบรม และการเผยแพร่"
      >
        <Link href={`/programs/${program.slug}`} className={buttonClass("outline")}><ExternalLink className="h-4 w-4" /> ดูหน้าหลักสูตร</Link>
      </PageHeader>

      <Tabs defaultValue={courses.length === 0 ? "courses" : "cohorts"}>
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="info">ข้อมูลหลักสูตร</TabsTrigger>
          <TabsTrigger value="courses">รายวิชา ({courses.length})</TabsTrigger>
          <TabsTrigger value="cohorts">รอบอบรม ({cohorts.length})</TabsTrigger>
          <TabsTrigger value="publish">การเผยแพร่</TabsTrigger>
        </TabsList>
        <TabsContent value="info" className="mt-4"><Card><ProgramInfoForm program={program} /></Card></TabsContent>
        <TabsContent value="courses" className="mt-4">
          <Card>
            <ProgramCoursesEditor
              programId={program.id}
              initial={courses.map((c) => ({ courseId: c.id, isRequired: c.is_required }))}
              allCourses={allCourses.map((c) => ({ id: c.id, title: c.title, visibility: c.visibility, instructor_name: c.instructor_name }))}
            />
          </Card>
        </TabsContent>
        <TabsContent value="cohorts" className="mt-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 className="font-semibold">รอบอบรม</h2>
                <p className="text-sm text-muted-foreground">แต่ละรอบมีวันเปิด-ปิดรับสมัคร จำนวนที่นั่ง และเงื่อนไขผู้สมัครของตัวเอง</p>
              </div>
              <CreateCohortDialog programId={program.id} {...options} />
            </div>
            {cohorts.length === 0 ? (
              <div className="p-5"><EmptyState icon={<CalendarDays className="h-5 w-5" />} title="ยังไม่มีรอบอบรม" /></div>
            ) : (
              <div className="overflow-x-auto p-3">
                <Table className="[&_td]:py-2.5">
                  <thead>
                    <tr>
                      <th>รอบ</th>
                      <th>สถานะ</th>
                      <th>รับสมัคร</th>
                      <th>อบรม</th>
                      <th className="text-right">ที่นั่ง</th>
                      <th className="text-right">รอพิจารณา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map((c) => {
                      const phase = COHORT_PHASE[c.phase];
                      return (
                        <tr key={c.id}>
                          <td><Link href={`/admin/cohorts/${c.id}`} className="font-medium hover:underline">{c.title}</Link></td>
                          <td><Badge variant={phase?.variant ?? "secondary"}>{phase?.label ?? c.phase}</Badge></td>
                          <td className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTimeTh(c.registration_opens_at)}<br />ถึง {formatDateTimeTh(c.registration_closes_at)}</td>
                          <td className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTimeTh(c.starts_at)}<br />ถึง {formatDateTimeTh(c.ends_at)}</td>
                          <td className="text-right tabular-nums">{c.approved_count}{c.capacity !== null ? ` / ${c.capacity}` : ""}{c.waitlisted_count > 0 && <span className="block text-xs text-muted-foreground">สำรอง {c.waitlisted_count}</span>}</td>
                          <td className="text-right tabular-nums">{c.pending_count > 0 ? <Badge variant="warning">{c.pending_count}</Badge> : 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="publish" className="mt-4"><Card><ProgramPublishActions programId={program.id} visibility={program.visibility} problems={publishProblems} /></Card></TabsContent>
      </Tabs>
    </>
  );
}
