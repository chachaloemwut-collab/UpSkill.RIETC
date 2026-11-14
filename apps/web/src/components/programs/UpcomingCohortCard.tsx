import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui";
import { CourseCover } from "@/components/course/CourseCard";
import { COHORT_PHASE, formatDateTh } from "@/lib/format";
import { cohortWhen } from "./ProgramCard";

export interface UpcomingCohort {
  id: string;
  title: string;
  phase: string;
  registration_opens_at: Date;
  registration_closes_at: Date;
  starts_at: Date;
  program_slug: string;
  program_title: string;
  program_summary: string | null;
  cover_video_id: string | null;
}

export function UpcomingCohortCard({ c }: { c: UpcomingCohort }) {
  const phase = COHORT_PHASE[c.phase];
  return (
    <Link href={`/programs/${c.program_slug}`} className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <div className="relative">
        <CourseCover videoId={c.cover_video_id} title={c.program_title} />
        {phase && <Badge variant={phase.variant} className="absolute left-3 top-3 bg-background/90 backdrop-blur">{phase.label}</Badge>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <span className="text-xs text-muted-foreground">{c.title}</span>
        <h3 className="line-clamp-2 font-semibold leading-snug group-hover:underline">{c.program_title}</h3>
        {c.program_summary && <p className="line-clamp-2 text-sm text-muted-foreground">{c.program_summary}</p>}
        <p className="mt-auto inline-flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          {cohortWhen({ phase: c.phase, registrationOpensAt: c.registration_opens_at, registrationClosesAt: c.registration_closes_at, startsAt: c.starts_at })}
          {" · "}เริ่มอบรม {formatDateTh(c.starts_at)}
        </p>
      </div>
    </Link>
  );
}
