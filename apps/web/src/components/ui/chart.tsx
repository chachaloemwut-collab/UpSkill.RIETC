"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useInView } from "./motion";

/* Single-series charts. Marks use the primary token so they follow light/dark themes;
   every chart has a hover tooltip and a visually hidden table for screen readers. */

export interface Datum {
  label: string;
  value: number;
}

type Format = (n: number) => string;
const defaultFormat: Format = (n) => n.toLocaleString();
const compact: Format = (n) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
const M = { top: 12, right: 12, bottom: 28, left: 44 };

function useWidth() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

function Tip({ x, y, label, value }: { x: number; y: number; label: string; value: string }) {
  return (
    <div style={{ left: x, top: y }} className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full animate-fade-in whitespace-nowrap rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md transition-[left,top] duration-150 ease-out">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function SrTable({ data, format, title }: { data: Datum[]; format: Format; title: string }) {
  return (
    <table className="sr-only">
      <caption>{title}</caption>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}><th scope="row">{d.label}</th><td>{format(d.value)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

interface ChartProps {
  data: Datum[];
  title: string;
  height?: number;
  format?: Format;
  axisFormat?: Format;
  className?: string;
}

function Axis({ ticks, y, w, axisFormat }: { ticks: number[]; y: (v: number) => number; w: number; axisFormat: Format }) {
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={w - M.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray={t === 0 ? undefined : "2 4"} />
          <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">{axisFormat(t)}</text>
        </g>
      ))}
    </>
  );
}

/** Bar with a 4px rounded data-end and a square base anchored to the axis. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function BarChart({ data, title, height = 240, format = defaultFormat, axisFormat = compact, className }: ChartProps) {
  const [ref, w] = useWidth();
  const inView = useInView(ref);
  const [hover, setHover] = React.useState<number | null>(null);
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.value)));
  const top = ticks[ticks.length - 1];
  const iw = Math.max(0, w - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const band = iw / data.length;
  const bw = Math.max(2, Math.min(band - 2, band * 0.6, 48));
  const y = (v: number) => M.top + ih - (v / top!) * ih;
  const every = Math.max(1, Math.ceil(32 / band));
  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={title} onPointerLeave={() => setHover(null)} className="absolute inset-0">
          <Axis ticks={ticks} y={y} w={w} axisFormat={axisFormat} />
          {data.map((d, i) => {
            const x = M.left + band * i + (band - bw) / 2;
            return (
              <g key={d.label}>
                <path
                  d={barPath(x, y(d.value), bw, M.top + ih - y(d.value))}
                  style={{ transformOrigin: `0 ${M.top + ih}px`, animationDelay: `${i * 40}ms` }}
                  className={cn("fill-primary transition-opacity", inView ? "animate-grow-y" : "opacity-0", hover !== null && hover !== i && "opacity-30")}
                />
                {i % every === 0 && (
                  <text x={x + bw / 2} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">{d.label}</text>
                )}
                <rect x={M.left + band * i} y={M.top} width={band} height={ih} fill="transparent" onPointerEnter={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && <Tip x={M.left + band * hover + band / 2} y={y(data[hover]!.value) - 8} label={data[hover]!.label} value={format(data[hover]!.value)} />}
      <SrTable data={data} format={format} title={title} />
    </div>
  );
}

export function AreaChart({ data, title, height = 240, format = defaultFormat, axisFormat = compact, className }: ChartProps) {
  const [ref, w] = useWidth();
  const inView = useInView(ref);
  const [hover, setHover] = React.useState<number | null>(null);
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.value)));
  const top = ticks[ticks.length - 1];
  const iw = Math.max(0, w - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const n = data.length;
  const x = (i: number) => M.left + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => M.top + ih - (v / top!) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join("");
  const area = `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 56))));
  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }}>
      {w > 0 && (
        <svg
          width={w}
          height={height}
          role="img"
          className="absolute inset-0"
          aria-label={title}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
            setHover(Math.max(0, Math.min(n - 1, Math.round(((px - M.left) / iw) * (n - 1)))));
          }}
        >
          <Axis ticks={ticks} y={y} w={w} axisFormat={axisFormat} />
          <path d={area} className={cn("fill-primary/10", inView ? "animate-fade-in" : "opacity-0")} style={{ animationDelay: "600ms", animationDuration: "600ms", animationFillMode: "both" }} />
          <path d={line} pathLength={1} strokeDasharray={1} fill="none" className={cn("stroke-primary", inView ? "animate-draw" : "opacity-0")} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => i % every === 0 && (
            <text key={d.label} x={x(i)} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">{d.label}</text>
          ))}
          {hover !== null && (
            <>
              <line x1={0} x2={0} y1={M.top} y2={M.top + ih} style={{ transform: `translateX(${x(hover)}px)` }} className="stroke-muted-foreground/50 transition-transform duration-150 ease-out" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(data[hover]!.value)} r={4} className="fill-primary stroke-background transition-[cx,cy] duration-150 ease-out" strokeWidth={2} />
            </>
          )}
        </svg>
      )}
      {hover !== null && <Tip x={x(hover)} y={y(data[hover]!.value) - 12} label={data[hover]!.label} value={format(data[hover]!.value)} />}
      <SrTable data={data} format={format} title={title} />
    </div>
  );
}

export function Sparkline({ values, height = 36, className }: { values: number[]; height?: number; className?: string }) {
  const [ref, w] = useWidth();
  const inView = useInView(ref);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${2 + (1 - (v - min) / range) * (height - 4)}`).join(" ");
  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }} aria-hidden="true">
      {w > 0 && (
        <svg width={w} height={height} className="absolute inset-0">
          <polyline points={pts} pathLength={1} strokeDasharray={1} fill="none" className={cn("stroke-primary", inView ? "animate-draw" : "opacity-0")} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

export function ProgressRing({ value, size = 64, stroke = 6, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-secondary" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} className="stroke-primary transition-[stroke-dashoffset] duration-500" />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums">{value}%</span>
    </div>
  );
}
