import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, GraduationCap } from "lucide-react";
import { Badge, Card, EmptyState, Table } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { CreateProgramDialog } from "@/components/admin/programs/ProgramActions";
import { CategoryManager } from "@/components/admin/programs/CategoryManager";
import { PROGRAM_VISIBILITY, formatDateTh, youtubeThumb } from "@/lib/format";
import { listProgramsAdmin } from "@/server/programs/programs.service";
import { listProgramCategories } from "@/server/programs/categories.service";
import { requireAdminPage } from "@/server/programs/admin-page";

export const metadata: Metadata = { title: "หลักสูตรอบรม", robots: { index: false } };

export default async function AdminProgramsPage() {
  const user = await requireAdminPage();
  const [programs, categories] = await Promise.all([listProgramsAdmin(user), listProgramCategories(user)]);
  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Link href="/admin" className="hover:text-foreground">ผู้ดูแลระบบ</Link><ChevronRight className="h-3.5 w-3.5" /> หลักสูตรอบรม</span>}
        title="หลักสูตรอบรม"
        description="รวมรายวิชาเป็นหลักสูตร เปิดรอบอบรมพร้อมวันเปิด-ปิดรับสมัคร และกำหนดเงื่อนไขผู้เข้าร่วม"
      >
        <CategoryManager initialCategories={categories} />
        <CreateProgramDialog />
      </PageHeader>
      <Card>
        {programs.length === 0 ? (
          <div className="p-5"><EmptyState icon={<GraduationCap className="h-5 w-5" />} title="ยังไม่มีหลักสูตรอบรม" description="กด “สร้างหลักสูตรอบรม” เพื่อเริ่มต้น" /></div>
        ) : (
          <div className="overflow-x-auto p-3">
            <Table className="[&_td]:py-2.5">
              <thead>
                <tr>
                  <th>หลักสูตร</th>
                  <th>สถานะ</th>
                  <th className="text-right">รายวิชา</th>
                  <th className="text-right">รอบอบรม</th>
                  <th className="text-right">รอพิจารณา</th>
                  <th>รอบถัดไป</th>
                  <th>แก้ไขล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((p) => {
                  const vis = PROGRAM_VISIBILITY[p.visibility];
                  const thumb = youtubeThumb(p.cover_video_id);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/admin/programs/${p.id}`} className="group flex items-center gap-3">
                          <span className="relative block h-10 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                            {thumb ? <Image src={thumb} alt="" fill sizes="64px" className="object-cover" /> : <GraduationCap className="m-auto mt-3 h-4 w-4 text-muted-foreground" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block max-w-xs truncate font-medium group-hover:underline">{p.title}</span>
                            {p.category && <span className="text-xs text-muted-foreground">{p.category}</span>}
                          </span>
                        </Link>
                      </td>
                      <td><Badge variant={vis?.variant ?? "secondary"}>{vis?.label ?? p.visibility}</Badge></td>
                      <td className="text-right tabular-nums">{p.course_count}</td>
                      <td className="text-right tabular-nums">{p.cohort_count}</td>
                      <td className="text-right tabular-nums">{p.pending_count > 0 ? <Badge variant="warning">{p.pending_count}</Badge> : 0}</td>
                      <td className="text-muted-foreground">{p.next_start ? formatDateTh(p.next_start) : "—"}</td>
                      <td className="text-muted-foreground">{formatDateTh(p.updated_at)}</td>
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
