import { formatStudyDurationTh } from "@upskill/core/study-hours";
import Link from "next/link";
import { CalendarDays, Clock, Layers } from "lucide-react";
import { Badge } from "@/components/ui";
import { CourseCover } from "@/components/course/CourseCard";
import { COHORT_PHASE, formatDateTh } from "@/lib/format";

export interface ProgramCardData {
  slug: string;
  title: string;
  summary: string | null;
  category: string | null;
  course_count: number;
  total_duration_sec: number;
  cover_video_id: string | null;
  nextCohort: { title: string; phase: string; registrationOpensAt: Date; registrationClosesAt: Date; startsAt: Date } | null;
}

export function cohortWhen(c: { phase: string; registrationOpensAt: Date; registrationClosesAt: Date; startsAt: Date }): string {
  if (c.phase === "scheduled") return `เปิดรับสมัคร ${formatDateTh(c.registrationOpensAt)}`;
  if (c.phase === "open") return `รับสมัครถึง ${formatDateTh(c.registrationClosesAt)}`;
  return `เริ่มอบรม ${formatDateTh(c.startsAt)}`;
}

export function ProgramCard({ program }: { program: ProgramCardData }) {
  const phase = program.nextCohort ? COHORT_PHASE[program.nextCohort.phase] : null;
  return (
    <Link href={`/programs/${program.slug}`} className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <div className="relative">
        <CourseCover videoId={program.cover_video_id} title={program.title} />
        {phase && <Badge variant={phase.variant} className="absolute left-3 top-3 bg-background/90 backdrop-blur">{phase.label}</Badge>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {program.category && <span className="text-xs font-medium text-muted-foreground">{program.category}</span>}
        <h3 className="line-clamp-2 font-semibold leading-snug group-hover:underline">{program.title}</h3>
        {program.summary && <p className="line-clamp-2 text-sm text-muted-foreground">{program.summary}</p>}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {program.course_count} รายวิชา</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatStudyDurationTh(program.total_duration_sec)}</span>
          {program.nextCohort && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {cohortWhen(program.nextCohort)}</span>}
        </div>
      </div>
    </Link>
  );
}
