import Link from "next/link";
import { BookOpenText, Check, ChevronRight, Lock, PlayCircle, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";

export interface LessonItem {
  id: string;
  order: number;
  title: string;
  durationSec: number;
  broken: boolean;
  completed: boolean;
  watchedPercent: number;
  unlocked: boolean;
  lessonTestRequired: boolean;
  lessonTestPassed: boolean;
  /** Good enough to move on per the course rule (defaults to lessonTestPassed). */
  lessonTestDone?: boolean;
  lessonTestSubmitted?: boolean;
  lessonTestBestScore?: number | null;
  checkpointPassed?: boolean;
  isPublic?: boolean;
  unitId?: string | null;
}

export interface UnitItem {
  id: string;
  number: number;
  title: string;
  summary: string | null;
  lessonCount: number;
  durationSec: number;
  completedCount: number;
}

/**
 * Curriculum list. When the course has learning units, lessons are shown under unit headers
 * (in lesson order; a header appears whenever the unit changes). `compact` = sidebar on the lesson page.
 */
export function LessonList({
  slug, lessons, units = [], enrolled, activeId, compact = false,
}: {
  slug: string;
  lessons: LessonItem[];
  units?: UnitItem[];
  enrolled: boolean;
  activeId?: string;
  compact?: boolean;
}) {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const hasUnits = units.length > 0;
  const rows: Array<{ kind: "unit"; unit: UnitItem | null; key: string } | { kind: "lesson"; lesson: LessonItem; isLastInGroup: boolean }> = [];
  let currentUnit: string | null | undefined;
  lessons.forEach((l, i) => {
    const unitKey = l.unitId && unitById.has(l.unitId) ? l.unitId : null;
    if (hasUnits && unitKey !== currentUnit) {
      rows.push({ kind: "unit", unit: unitKey ? unitById.get(unitKey)! : null, key: `unit-${unitKey ?? "none"}-${i}` });
      currentUnit = unitKey;
    }
    const next = lessons[i + 1];
    const nextUnit = next ? (next.unitId && unitById.has(next.unitId) ? next.unitId : null) : undefined;
    rows.push({ kind: "lesson", lesson: l, isLastInGroup: !next || (hasUnits && nextUnit !== unitKey) });
  });

  return (
    <ol className="relative grid gap-0.5 p-3">
      {rows.map((row) =>
        row.kind === "unit" ? (
          <UnitHeader key={row.key} unit={row.unit} enrolled={enrolled} compact={compact} />
        ) : (
          <LessonRow key={row.lesson.id} slug={slug} lesson={row.lesson} enrolled={enrolled} active={activeId === row.lesson.id} isLast={row.isLastInGroup} />
        ),
      )}
    </ol>
  );
}

function UnitHeader({ unit, enrolled, compact }: { unit: UnitItem | null; enrolled: boolean; compact: boolean }) {
  if (!unit) {
    return <li className="px-2.5 pb-1 pt-3 text-xs font-semibold text-muted-foreground first:pt-0">เนื้อหาเพิ่มเติม</li>;
  }
  const done = enrolled && unit.lessonCount > 0 && unit.completedCount === unit.lessonCount;
  return (
    <li className="pt-3 first:pt-0">
      <div className="rounded-lg bg-muted/40 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">หน่วยที่ {unit.number}</p>
            <p className={cn("font-semibold leading-snug", compact ? "text-sm" : "text-sm sm:text-base")}>{unit.title}</p>
          </div>
          {done ? (
            <Badge variant="success" className="h-5 shrink-0 px-1.5 py-0 text-[10px]">ครบแล้ว</Badge>
          ) : enrolled ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{unit.completedCount}/{unit.lessonCount}</span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {unit.lessonCount} คลิป · {formatDuration(unit.durationSec)}
        </p>
        {!compact && unit.summary && (
          <details className="group mt-2">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary hover:underline">
              <BookOpenText className="h-3.5 w-3.5" /> อ่านบทความสรุปประจำหน่วย
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-2 whitespace-pre-line rounded-md border bg-background p-3 text-sm leading-relaxed text-foreground/90">{unit.summary}</div>
          </details>
        )}
      </div>
    </li>
  );
}

function LessonRow({ slug, lesson: l, enrolled, active, isLast }: { slug: string; lesson: LessonItem; enrolled: boolean; active: boolean; isLast: boolean }) {
  const clickable = enrolled && l.unlocked && !l.broken;
  const inProgress = enrolled && !l.completed && l.watchedPercent > 0;
  const testDone = l.lessonTestDone ?? l.lessonTestPassed;
  const fullyDone = l.completed && testDone;

  const body = (
    <div className={cn("group relative flex items-start gap-3.5 rounded-lg p-2.5 transition-colors", active && "bg-accent/80 shadow-xs", clickable && !active && "hover:bg-muted/50")}>
      <div className="relative flex flex-col items-center">
        <span
          className={cn(
            "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums shadow-xs transition-all",
            fullyDone && "border-success bg-success text-white shadow-success/20",
            active && !fullyDone && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/20",
            !fullyDone && !active && l.unlocked && "border-border bg-background text-foreground",
            !l.unlocked && "border-border/60 bg-muted/60 text-muted-foreground",
          )}
        >
          {fullyDone ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : !l.unlocked ? <Lock className="h-3 w-3 text-muted-foreground" /> : active ? <PlayCircle className="h-3.5 w-3.5" /> : l.order}
        </span>
        {!isLast && <span aria-hidden className={cn("absolute bottom-0 top-7 -mb-3 h-full w-0.5 transition-colors", fullyDone ? "bg-success/70" : "bg-border/70")} />}
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("truncate text-sm", clickable || !enrolled ? "text-foreground" : "text-muted-foreground", active && "font-semibold text-primary")}>{l.title}</p>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(l.durationSec)}</span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {enrolled &&
            (fullyDone ? (
              <span className="font-medium text-success">เรียนครบแล้ว</span>
            ) : l.completed ? (
              <span className="font-medium text-success">ดูคลิปครบแล้ว</span>
            ) : inProgress ? (
              <span className="font-medium text-primary">ดูแล้ว {l.watchedPercent}%</span>
            ) : l.unlocked ? (
              <span>พร้อมเรียน</span>
            ) : (
              <span>ล็อกตามลำดับ</span>
            ))}
          {enrolled && l.completed && l.checkpointPassed === false && (
            <Badge variant="warning" className="h-4 px-1.5 py-0 text-[10px]">ยังไม่ได้ตอบคำถามระหว่างคลิป</Badge>
          )}
          {l.isPublic === false && (
            <Badge variant="outline" className="h-4 border-amber-500/30 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400">
              <Lock className="mr-0.5 h-2.5 w-2.5" /> ไม่สาธารณะ
            </Badge>
          )}
          {l.broken && (
            <Badge variant="destructive" className="h-4 px-1.5 py-0 text-[10px]">
              <TriangleAlert className="mr-0.5 h-2.5 w-2.5" /> วิดีโอเสีย
            </Badge>
          )}
          {enrolled && l.completed && l.lessonTestRequired && !testDone && (
            <Badge variant="warning" className="h-4 px-1.5 py-0 text-[10px]">รอทำแบบทดสอบท้ายคลิป</Badge>
          )}
          {enrolled && l.lessonTestRequired && testDone && (
            <Badge variant={l.lessonTestPassed ? "success" : "secondary"} className="h-4 px-1.5 py-0 text-[10px]">
              {l.lessonTestBestScore !== undefined && l.lessonTestBestScore !== null ? `แบบทดสอบ ${Math.round(l.lessonTestBestScore)}%` : "ผ่านแบบทดสอบแล้ว"}
            </Badge>
          )}
        </div>

        {inProgress && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${l.watchedPercent}%` }} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <li className="relative">
      {clickable ? (
        <Link href={`/courses/${slug}/lessons/${l.id}`} aria-current={active ? "step" : undefined} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}
