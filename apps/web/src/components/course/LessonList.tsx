import Link from "next/link";
import { Check, Lock, PlayCircle, TriangleAlert } from "lucide-react";
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
  isPublic?: boolean;
}

/** Timeline Stepper curriculum list with vertical connector lines and comprehensive status telemetry. */
export function LessonList({ slug, lessons, enrolled, activeId }: { slug: string; lessons: LessonItem[]; enrolled: boolean; activeId?: string }) {
  return (
    <ol className="relative grid gap-0.5 p-3">
      {lessons.map((l, idx) => {
        const isLast = idx === lessons.length - 1;
        const clickable = enrolled && l.unlocked && !l.broken;
        const active = activeId === l.id;
        const inProgress = enrolled && !l.completed && l.watchedPercent > 0;

        const body = (
          <div
            className={cn(
              "group relative flex items-start gap-3.5 rounded-lg p-2.5 transition-colors",
              active && "bg-accent/80 shadow-xs",
              clickable && !active && "hover:bg-muted/50",
            )}
          >
            {/* Timeline node */}
            <div className="relative flex flex-col items-center">
              <span
                className={cn(
                  "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums shadow-xs transition-all",
                  l.completed && "border-success bg-success text-white shadow-success/20",
                  active && !l.completed && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/20",
                  !l.completed && !active && l.unlocked && "border-border bg-background text-foreground",
                  !l.unlocked && "border-border/60 bg-muted/60 text-muted-foreground",
                )}
              >
                {l.completed ? (
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                ) : !l.unlocked ? (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                ) : active ? (
                  <PlayCircle className="h-3.5 w-3.5" />
                ) : (
                  l.order
                )}
              </span>
              {/* Vertical connector line */}
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-7 bottom-0 w-0.5 h-full -mb-3 transition-colors",
                    l.completed ? "bg-success/70" : "bg-border/70"
                  )}
                />
              )}
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={cn(
                    "truncate text-sm",
                    clickable || !enrolled ? "text-foreground" : "text-muted-foreground",
                    active && "font-semibold text-primary"
                  )}
                >
                  {l.title}
                </p>
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {formatDuration(l.durationSec)}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {enrolled && (
                  <>
                    {l.completed ? (
                      <span className="font-medium text-success">เรียนผ่านแล้ว (100%)</span>
                    ) : inProgress ? (
                      <span className="font-medium text-primary">ดูแล้ว {l.watchedPercent}%</span>
                    ) : l.unlocked ? (
                      <span>พร้อมเรียน</span>
                    ) : (
                      <span>บทเรียนถูกล็อกตามลำดับ</span>
                    )}
                  </>
                )}
                {l.isPublic === false && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-amber-500/30 text-amber-600 dark:text-amber-400">
                    <Lock className="h-2.5 w-2.5 mr-0.5" /> ไม่สาธารณะ
                  </Badge>
                )}
                {l.broken && (
                  <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">
                    <TriangleAlert className="h-2.5 w-2.5 mr-0.5" /> วิดีโอเสีย
                  </Badge>
                )}
                {enrolled && l.completed && l.lessonTestRequired && !l.lessonTestPassed && (
                  <Badge variant="warning" className="text-[10px] py-0 px-1.5 h-4">
                    รอทำแบบทดสอบประจำบท
                  </Badge>
                )}
                {enrolled && l.lessonTestRequired && l.lessonTestPassed && (
                  <Badge variant="success" className="text-[10px] py-0 px-1.5 h-4">
                    ผ่านแบบทดสอบแล้ว
                  </Badge>
                )}
              </div>

              {inProgress && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${l.watchedPercent}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        );

        return (
          <li key={l.id} className="relative">
            {clickable ? (
              <Link
                href={`/courses/${slug}/lessons/${l.id}`}
                aria-current={active ? "step" : undefined}
                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
