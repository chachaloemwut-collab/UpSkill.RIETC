"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "./display";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, GripIcon, TrendingDownIcon, TrendingUpIcon } from "./icons";

export function AspectRatio({ ratio = 16 / 9, className, children }: { ratio?: number; className?: string; children: React.ReactNode }) {
  return <div style={{ aspectRatio: ratio }} className={cn("relative w-full overflow-hidden rounded-lg", className)}>{children}</div>;
}

export function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div tabIndex={0} className={cn("overflow-auto rounded-lg border [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
      {children}
    </div>
  );
}

/* ---------- Resizable ---------- */
interface ResizableProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultSize?: number;
  min?: number;
  max?: number;
  className?: string;
}

export function Resizable({ left, right, defaultSize = 50, min = 20, max = 80, className }: ResizableProps) {
  const [size, setSize] = React.useState(defaultSize);
  const ref = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div ref={ref} className={cn("flex overflow-hidden rounded-lg border", className)}>
      <div style={{ width: `${size}%` }} className="min-w-0 overflow-auto">{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(size)}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          setSize(clamp(((e.clientX - r.left) / r.width) * 100));
        }}
        onPointerUp={() => (dragging.current = false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setSize((s) => clamp(s - 5));
          if (e.key === "ArrowRight") setSize((s) => clamp(s + 5));
        }}
        className="group relative flex w-px shrink-0 cursor-col-resize touch-none items-center justify-center bg-border transition-colors hover:bg-primary/40 active:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="z-10 flex h-6 w-3.5 items-center justify-center rounded-sm border bg-background text-muted-foreground transition-[color,scale] group-hover:scale-110 group-hover:text-foreground group-active:scale-125">
          <GripIcon className="h-3 w-3" />
        </span>
      </div>
      <div className="min-w-0 flex-1 overflow-auto">{right}</div>
    </div>
  );
}

/* ---------- Collapsible ---------- */
export function Collapsible({ trigger, children, defaultOpen = false }: { trigger: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-md py-1.5 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {trigger}
        <ChevronDownIcon className={cn("text-muted-foreground transition-transform duration-500 ease-spring-bouncy", open && "rotate-180")} />
      </button>
      <div className={cn("grid transition-all duration-500 ease-spring-smooth", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Carousel ---------- */
export function Carousel({ slides, autoPlay, className }: { slides: React.ReactNode[]; autoPlay?: number; className?: string }) {
  const [i, setI] = React.useState(0);
  const n = slides.length;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  React.useEffect(() => {
    if (!autoPlay) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), autoPlay);
    return () => clearInterval(t);
  }, [autoPlay, n, i]);
  const nav = "absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background/80 backdrop-blur transition-[background-color,scale] hover:scale-110 hover:bg-background active:scale-90";
  return (
    <div
      role="region"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
      className={cn("relative rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", className)}
    >
      <div className="relative overflow-hidden rounded-lg">
        <div className="flex transition-transform duration-700 ease-spring-smooth" style={{ transform: `translateX(-${i * 100}%)` }}>
          {slides.map((s, k) => (
            <div key={k} className="w-full shrink-0" aria-hidden={k !== i} aria-roledescription="slide">
              {s}
            </div>
          ))}
        </div>
        <button aria-label="Previous slide" onClick={() => go(-1)} className={cn(nav, "left-3")}>
          <ChevronLeftIcon />
        </button>
        <button aria-label="Next slide" onClick={() => go(1)} className={cn(nav, "right-3")}>
          <ChevronRightIcon />
        </button>
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {slides.map((_, k) => (
          <button key={k} aria-label={`Go to slide ${k + 1}`} aria-current={k === i} onClick={() => setI(k)} className={cn("h-1.5 rounded-full transition-all duration-300 hover:bg-muted-foreground/60", k === i ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30")} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Stepper ---------- */
export function Stepper({ steps, current }: { steps: { title: string; description?: string }[]; current: number }) {
  return (
    <ol className="flex w-full items-start">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={i} aria-current={active ? "step" : undefined} className="relative flex flex-1 flex-col items-center gap-2 px-1 text-center">
            {i > 0 && (
              <span className="absolute top-4 h-px overflow-hidden bg-border" style={{ left: "calc(-50% + 1.25rem)", right: "calc(50% + 1.25rem)" }}>
                <span className={cn("block h-full origin-left bg-primary transition-transform duration-700 ease-spring-smooth", i <= current ? "scale-x-100" : "scale-x-0")} />
              </span>
            )}
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium transition-all duration-300",
                done && "border-primary bg-primary text-primary-foreground",
                active && "scale-110 border-2 border-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.1)]",
                !done && !active && "text-muted-foreground"
              )}
            >
              {done ? <CheckIcon className="h-3.5 w-3.5 animate-zoom-in" /> : i + 1}
            </span>
            <span className={cn("text-sm font-medium", !done && !active && "text-muted-foreground")}>{s.title}</span>
            {s.description && <span className="hidden text-xs text-muted-foreground sm:block">{s.description}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Timeline ---------- */
export function Timeline({ items }: { items: { title: string; time: string; description?: string; active?: boolean }[] }) {
  return (
    <ol className="relative ml-1.5 border-l">
      {items.map((it, i) => (
        <li key={i} className="mb-6 ml-5 last:mb-0">
          <span className={cn("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background", it.active ? "bg-primary" : "bg-muted-foreground/40")}>
            {it.active && <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-50" />}
          </span>
          <time className="text-xs text-muted-foreground">{it.time}</time>
          <h4 className="text-sm font-medium">{it.title}</h4>
          {it.description && <p className="mt-0.5 text-sm text-muted-foreground">{it.description}</p>}
        </li>
      ))}
    </ol>
  );
}

/* ---------- Stat ---------- */
export function Stat({ label, value, delta, hint, children }: { label: string; value: string; delta?: number; hint?: string; children?: React.ReactNode }) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {delta !== undefined && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success" : "text-destructive")}>
            {up ? <TrendingUpIcon className="h-3.5 w-3.5" /> : <TrendingDownIcon className="h-3.5 w-3.5" />}
            {up ? "+" : "−"}
            {Math.abs(delta)}%
          </span>
          {hint}
        </p>
      )}
      {children && <div className="mt-3">{children}</div>}
    </Card>
  );
}
