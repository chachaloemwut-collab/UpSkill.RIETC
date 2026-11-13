"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Indicator, useIndicator } from "./motion";

/* ---------- Tabs ---------- */
const TabsCtx = React.createContext<{ value: string; setValue: (v: string) => void }>({ value: "", setValue: () => {} });

export function Tabs({ defaultValue, children, className }: { defaultValue: string; children: React.ReactNode; className?: string }) {
  const [value, setValue] = React.useState(defaultValue);
  return (
    <TabsCtx.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}
export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  const { value } = React.useContext(TabsCtx);
  const ref = React.useRef<HTMLDivElement>(null);
  const rect = useIndicator(ref, "[aria-selected=true]", value);
  return (
    <div ref={ref} role="tablist" className={cn("relative inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground", className)}>
      <Indicator rect={rect} className="bg-background shadow-xs" />
      {children}
    </div>
  );
}
export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = React.useContext(TabsCtx);
  const active = ctx.value === value;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "relative z-10 inline-flex h-7 items-center rounded-md px-3 text-sm font-medium transition-[color,transform,translate,scale,rotate] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-foreground" : "hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
export function TabsContent({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = React.useContext(TabsCtx);
  if (ctx.value !== value) return null;
  return <div role="tabpanel" className={cn("mt-3 animate-slide-up", className)}>{children}</div>;
}

/* ---------- Accordion ---------- */
export function Accordion({ items }: { items: { title: string; content: React.ReactNode }[] }) {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <div className="divide-y rounded-lg border">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {it.title}
              <svg className={cn("h-4 w-4 text-muted-foreground transition-transform duration-500 ease-spring-bouncy", isOpen && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div className={cn("grid transition-all duration-500 ease-spring-smooth", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
              <div className="overflow-hidden">
                <div className="px-4 pb-4 text-sm text-muted-foreground">{it.content}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Breadcrumb ---------- */
export function Breadcrumb({ items }: { items: string[] }) {
  return (
    <nav aria-label="breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="inline-flex items-center gap-1.5">
              {last ? <span className="font-medium text-foreground">{it}</span> : <a href="#" onClick={(e) => e.preventDefault()} className="transition-colors hover:text-foreground">{it}</a>}
              {!last && <span className="text-muted-foreground/50">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const btn = "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm transition-[color,background-color,transform,translate,scale,rotate] hover:bg-accent active:scale-90 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const pages: (number | "…")[] = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  return (
    <nav className="flex items-center gap-1" aria-label="pagination">
      <button className={btn} disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Previous">‹</button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={i} className="px-1 text-muted-foreground">…</span>
        ) : (
          <button key={i} onClick={() => onChange(p)} aria-current={p === page ? "page" : undefined} className={cn(btn, p === page && "border bg-background font-medium")}>
            <span key={p === page ? "on" : "off"} className={cn(p === page && "animate-pop-sm")}>{p}</span>
          </button>
        )
      )}
      <button className={btn} disabled={page === total} onClick={() => onChange(page + 1)} aria-label="Next">›</button>
    </nav>
  );
}
