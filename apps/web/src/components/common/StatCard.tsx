"use client";
import type { ReactNode } from "react";
import { AnimatedNumber, Card } from "@/components/ui";

/** KPI tile from the VEC admin dashboard: label, animated value, icon chip. */
export function StatCard({ label, value, unit, hint, icon, index = 0 }: { label: string; value: number; unit?: string; hint?: ReactNode; icon: ReactNode; index?: number }) {
  return (
    <Card
      className="animate-slide-up p-5 transition-[translate,box-shadow] duration-300 [animation-fill-mode:both] hover:-translate-y-0.5 hover:shadow-md"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        <AnimatedNumber value={value} duration={800} format={(n) => Math.round(n).toLocaleString("th-TH")} />
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
