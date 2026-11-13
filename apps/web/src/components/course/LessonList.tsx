import Link from "next/link";
import { Badge, cx, formatDuration } from "@/components/ui";

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

export function LessonList({ slug, lessons, enrolled, activeId }: { slug: string; lessons: LessonItem[]; enrolled: boolean; activeId?: string }) {
  return (
    <ol className="divide-y divide-stone-100">
      {lessons.map((l) => {
        const clickable = enrolled && l.unlocked && !l.broken;
        const body = (
          <div className={cx("flex items-center gap-3 px-3 py-3", activeId === l.id && "bg-green-50", clickable && "hover:bg-stone-50")}>
            <span
              className={cx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                l.completed ? "bg-green-600 text-white" : "bg-stone-100 text-stone-600",
              )}
            >
              {l.completed ? "✓" : l.order}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cx("truncate text-sm", clickable ? "text-stone-900" : "text-stone-400")}>{l.title}</p>
              <p className="text-xs text-stone-500">
                {formatDuration(l.durationSec)}
                {enrolled && !l.completed && l.watchedPercent > 0 && ` · ดูแล้ว ${l.watchedPercent}%`}
              </p>
            </div>
            {l.broken && <Badge tone="red">วิดีโอเสีย</Badge>}
            {enrolled && !l.unlocked && <span aria-label="ล็อก">🔒</span>}
          </div>
        );
        return <li key={l.id}>{clickable ? <Link href={`/courses/${slug}/lessons/${l.id}`}>{body}</Link> : body}</li>;
      })}
    </ol>
  );
}
