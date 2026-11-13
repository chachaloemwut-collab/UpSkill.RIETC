import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, BookOpen, CheckCircle2, Presentation, TriangleAlert, Users } from "lucide-react";
import { Badge, Card, EmptyState, Table } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { CreateCourseDialog } from "@/components/instructor/CreateCourseForm";
import { VISIBILITY, formatDateTh, formatDuration, youtubeThumb } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { listMyCourses } from "@/server/courses/instructor.service";

export const metadata: Metadata = { title: "จัดการหลักสูตร" };

export default async function InstructorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "instructor" && user.role !== "admin") redirect("/");
  const courses = await listMyCourses(user);
  const learners = courses.reduce((n, c) => n + c.enrollment_count, 0);
  const graduates = courses.reduce((n, c) => n + c.completed_count, 0);
  const broken = courses.reduce((n, c) => n + c.broken_count, 0);

  return (
    <>
      <PageHeader title="จัดการหลักสูตร" description="สร้างและดูแลหลักสูตรของคุณ ติดตามจำนวนผู้เรียน">
        <CreateCourseDialog />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label="หลักสูตรทั้งหมด" value={courses.length} unit="หลักสูตร" hint={`เผยแพร่ ${courses.filter((c) => c.visibility === "published").length} หลักสูตร`} icon={<Presentation />} />
        <StatCard index={1} label="ผู้เรียนทั้งหมด" value={learners} unit="คน" icon={<Users />} />
        <StatCard index={2} label="เรียนจบแล้ว" value={graduates} unit="คน" hint={learners ? `${Math.round((graduates / learners) * 100)}% ของผู้เรียน` : undefined} icon={<CheckCircle2 />} />
        <StatCard index={3} label="วิดีโอที่ต้องแก้ไข" value={broken} unit="บท" hint={broken ? "ผู้เรียนเข้าบทเหล่านี้ไม่ได้" : "ทุกวิดีโอใช้งานได้"} icon={<TriangleAlert />} />
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">หลักสูตรของฉัน</h2>
          <span className="text-sm text-muted-foreground">{courses.length} หลักสูตร</span>
        </div>
        {courses.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<BookOpen className="h-5 w-5" />} title="ยังไม่มีหลักสูตร" description="กด “สร้างหลักสูตร” เพื่อเริ่มต้น เพิ่มบทเรียนจากลิงก์ YouTube ได้ทันที" />
          </div>
        ) : (
          <div className="p-3">
            <Table className="[&_td]:py-2.5">
              <thead>
                <tr>
                  <th>หลักสูตร</th>
                  <th>สถานะ</th>
                  <th className="text-right">บทเรียน</th>
                  <th className="text-right">ผู้เรียน</th>
                  <th className="text-right">จบแล้ว</th>
                  <th>แก้ไขล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => {
                  const vis = VISIBILITY[c.visibility];
                  const thumb = youtubeThumb(c.cover_video_id);
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/instructor/courses/${c.id}`} className="group flex items-center gap-3">
                          <span className="relative block h-10 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                            {thumb ? <Image src={thumb} alt="" fill sizes="64px" className="object-cover" /> : <BookOpen className="m-auto mt-3 h-4 w-4 text-muted-foreground" />}
                          </span>
                          <span className="max-w-xs truncate font-medium group-hover:underline">{c.title}</span>
                          {c.is_verified_course && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-success" aria-label="Verified" />}
                        </Link>
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                          <Badge variant={vis?.variant ?? "secondary"}>{vis?.label ?? c.visibility}</Badge>
                          {c.broken_count > 0 && <Badge variant="destructive">วิดีโอเสีย {c.broken_count}</Badge>}
                        </div>
                      </td>
                      <td className="text-right tabular-nums">
                        {c.lesson_count} <span className="text-xs text-muted-foreground">({formatDuration(c.total_duration_sec)})</span>
                      </td>
                      <td className="text-right tabular-nums">{c.enrollment_count.toLocaleString("th-TH")}</td>
                      <td className="text-right tabular-nums">{c.completed_count.toLocaleString("th-TH")}</td>
                      <td className="text-muted-foreground">{formatDateTh(c.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
