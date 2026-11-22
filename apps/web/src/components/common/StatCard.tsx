"use client";
import type { ReactNode } from "react";
import { AnimatedNumber, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export type StatCardTone = "primary" | "success" | "warning" | "info";

const TONE_STYLES: Record<StatCardTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  info: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
};

/** KPI tile with semantic tone colors, animated values, and sub-badge. */
export function StatCard({
  label,
  value,
  unit,
  hint,
  icon,
  tone,
  subBadge,
  progress,
  index = 0,
}: {
  label: string;
  value: number;
  unit?: string;
  hint?: ReactNode;
  icon: ReactNode;
  tone?: StatCardTone;
  subBadge?: ReactNode;
  progress?: number;
  index?: number;
}) {
  return (
    <Card
      className="min-w-0 animate-slide-up p-4 transition-[translate,box-shadow] duration-300 [animation-fill-mode:both] hover:-translate-y-0.5 hover:shadow-md sm:p-5"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] font-medium leading-snug text-muted-foreground sm:text-sm">{label}</p>
        <span
          className={cn(
            "hidden h-8 w-8 shrink-0 sm:flex items-center justify-center rounded-lg transition-transform group-hover:scale-105 [&>svg]:h-4 [&>svg]:w-4",
            tone ? TONE_STYLES[tone] : "bg-muted text-muted-foreground"
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-xl font-bold sm:text-2xl tracking-tight tabular-nums">
        <AnimatedNumber value={value} duration={800} format={(n) => Math.round(n).toLocaleString("th-TH")} />
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          />
        </div>
      )}
      {subBadge && <div className="mt-2 text-xs font-medium text-foreground/80">{subBadge}</div>}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
