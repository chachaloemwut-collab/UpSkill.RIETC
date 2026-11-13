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
}

/** Curriculum list: done / current / locked states, with how much of each lesson was watched. */
export function LessonList({ slug, lessons, enrolled, activeId }: { slug: string; lessons: LessonItem[]; enrolled: boolean; activeId?: string }) {
  return (
    <ol className="grid gap-1 p-2">
      {lessons.map((l) => {
        const clickable = enrolled && l.unlocked && !l.broken;
        const active = activeId === l.id;
        const body = (
          <div
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors",
              active && "bg-accent",
              clickable && !active && "hover:bg-muted/60",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                l.completed && "border-success bg-success text-white",
                active && !l.completed && "border-primary bg-primary text-primary-foreground",
                !l.completed && !active && "text-muted-foreground",
              )}
            >
              {l.completed ? <Check className="h-3.5 w-3.5" /> : active ? <PlayCircle className="h-3.5 w-3.5" /> : l.order}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm", clickable || !enrolled ? "text-foreground" : "text-muted-foreground", active && "font-medium")}>{l.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDuration(l.durationSec)}
                {enrolled && !l.completed && l.watchedPercent > 0 && ` · ดูแล้ว ${l.watchedPercent}%`}
              </p>
              {enrolled && !l.completed && l.watchedPercent > 0 && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${l.watchedPercent}%` }} />
                </div>
              )}
            </div>
            {l.broken && (
              <Badge variant="destructive">
                <TriangleAlert className="h-3 w-3" /> วิดีโอเสีย
              </Badge>
            )}
            {enrolled && !l.unlocked && <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="ล็อก" />}
          </div>
        );
        return (
          <li key={l.id}>
            {clickable ? (
              <Link href={`/courses/${slug}/lessons/${l.id}`} aria-current={active ? "step" : undefined} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
