import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { ProgramCard } from "@/components/programs/ProgramCard";
import { listPublishedPrograms } from "@/server/programs/programs.service";

export const metadata: Metadata = { title: "หลักสูตรอบรม", description: "หลักสูตรอบรมที่เปิดรับสมัคร พร้อมรอบอบรมและเงื่อนไขการสมัคร" };
export const dynamic = "force-dynamic";

const GROUPS = [
  { key: "open", title: "เปิดรับสมัคร", phases: ["open"] },
  { key: "soon", title: "เร็วๆ นี้", phases: ["scheduled"] },
  { key: "other", title: "หลักสูตรอื่น", phases: null },
] as const;

export default async function ProgramsPage() {
  const programs = await listPublishedPrograms();
  const used = new Set<string>();
  const sections = GROUPS.map((g) => {
    const items = programs.filter((p) => !used.has(p.id) && (g.phases === null || (p.nextCohort && (g.phases as readonly string[]).includes(p.nextCohort.phase))));
    items.forEach((p) => used.add(p.id));
    return { ...g, items };
  }).filter((s) => s.items.length > 0);

  return (
    <>
      <PageHeader title="หลักสูตรอบรม" description="หลักสูตรที่จัดเป็นรอบอบรม มีกำหนดเปิด-ปิดรับสมัครและเงื่อนไขผู้เข้าร่วม" />
      {programs.length === 0 ? (
        <EmptyState icon={<GraduationCap className="h-5 w-5" />} title="ยังไม่มีหลักสูตรอบรมที่เผยแพร่" description="ติดตามประกาศรอบอบรมใหม่ได้ที่หน้าประกาศ" />
      ) : (
        <div className="grid gap-10">
          {sections.map((s) => (
            <section key={s.key}>
              <h2 className="mb-4 text-base font-semibold">{s.title} <span className="text-sm font-normal text-muted-foreground">({s.items.length})</span></h2>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {s.items.map((p) => <ProgramCard key={p.id} program={p} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
