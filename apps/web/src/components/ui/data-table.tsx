"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownWideNarrow, ArrowUpNarrowWide, Bookmark, BookmarkPlus, ChevronDown, Columns3, EyeOff, FunnelX, ListFilter, Pin, PinOff, Rows3, SearchX, Trash, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Calendar } from "./date";
import { Table } from "./display";
import { Checkbox, Input, Slider } from "./form";
import { Select } from "./smart-select";
import { InputGroup } from "./inputs";
import { Indicator, RollingNumber, bump, prefersReducedMotion, springEasing, useIndicator } from "./motion";
import { Popover, usePresence } from "./overlay";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "./icons";

export interface Column<T> {
  key: keyof T & string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right";
  render?: (row: T) => React.ReactNode;
  /* ---- Used by AdvancedDataTable only (DataTable ignores them) ---- */
  /** Header filter UI for this column. Omit for a column that can't be filtered. */
  filter?: FilterKind;
  /** Raw value used to filter, sort and search. Defaults to `row[key]`. Dates may be `Date`, ISO string or timestamp. */
  accessor?: (row: T) => unknown;
  /** `enum`: display labels (and list order) for the raw values. */
  options?: { value: string; label: string }[];
  /** Formats a raw value for chips, lists and search (e.g. currency). */
  format?: (value: unknown) => string;
  /** `boolean`: labels for true / false. Defaults to ["ใช่", "ไม่ใช่"]. */
  booleanLabels?: [string, string];
  /** Set false to keep the column from being hidden. */
  hideable?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: keyof T;
  pageSize?: number;
  searchKeys?: (keyof T)[];
  searchPlaceholder?: string;
  selectable?: boolean;
  emptyText?: string;
  onSelectionChange?: (keys: unknown[]) => void;
}

export function DataTable<T extends Record<string, unknown>>({
  data, columns, rowKey, pageSize = 5, searchKeys, searchPlaceholder = "Search…", selectable, emptyText = "No results.", onSelectionChange,
}: DataTableProps<T>) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: keyof T; dir: 1 | -1 } | null>(null);
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<unknown>>(new Set());

  const rows = React.useMemo(() => {
    let r = data;
    if (query && searchKeys) {
      const q = query.toLowerCase();
      r = r.filter((row) => searchKeys.some((k) => String(row[k]).toLowerCase().includes(q)));
    }
    if (sort) {
      r = [...r].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
      });
    }
    return r;
  }, [data, query, sort, searchKeys]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pages);
  const view = rows.slice((cur - 1) * pageSize, cur * pageSize);
  const allOnPage = view.length > 0 && view.every((r) => selected.has(r[rowKey]));

  const commit = (next: Set<unknown>) => {
    setSelected(next);
    onSelectionChange?.([...next]);
  };
  const toggle = (k: unknown) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    commit(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    view.forEach((r) => (allOnPage ? next.delete(r[rowKey]) : next.add(r[rowKey])));
    commit(next);
  };
  const cycleSort = (key: keyof T) => setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  const colSpan = columns.length + (selectable ? 1 : 0);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {searchKeys && (
          <InputGroup
            prefix={<SearchIcon />}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
        )}
        {selectable && (
          <span className="text-sm text-muted-foreground">
            <span key={selected.size} className="inline-block animate-pop-sm tabular-nums">{selected.size}</span> / {data.length} selected
          </span>
        )}
      </div>
      <Table>
        <thead>
          <tr>
            {selectable && (
              <th className="w-10">
                <Checkbox checked={allOnPage} onChange={toggleAll} aria-label="Select all on page" />
              </th>
            )}
            {columns.map((c) => {
              const dir = sort?.key === c.key ? sort.dir : 0;
              return (
                <th key={c.key} style={{ textAlign: c.align ?? "left" }} aria-sort={dir === 1 ? "ascending" : dir === -1 ? "descending" : undefined}>
                  {c.sortable ? (
                    <button onClick={() => cycleSort(c.key)} className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", dir && "text-foreground")}>
                      {c.header}
                      <span key={dir} className="flex animate-zoom-in">
                        {dir === 1 ? <ArrowUpIcon className="h-3.5 w-3.5" /> : dir === -1 ? <ArrowDownIcon className="h-3.5 w-3.5" /> : <ArrowUpDownIcon className="h-3.5 w-3.5 opacity-50" />}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody key={`${cur}-${String(sort?.key)}-${sort?.dir}-${query}`}>
          {view.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="h-24 text-center text-muted-foreground">{emptyText}</td>
            </tr>
          ) : (
            view.map((row, i) => {
              const k = row[rowKey];
              const isSel = selected.has(k);
              return (
                <tr key={String(k)} className={cn("animate-slide-up [animation-fill-mode:both]", isSel && "bg-muted/50")} style={{ animationDelay: `${i * 30}ms` }}>
                  {selectable && (
                    <td>
                      <Checkbox checked={isSel} onChange={() => toggle(k)} aria-label={`Select ${String(k)}`} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align ?? "left" }} className={cn(c.align === "right" && "tabular-nums")}>
                      {c.render ? c.render(row) : String(row[c.key])}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{rows.length} rows</span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">Page {cur} of {pages}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous page" disabled={cur === 1} onClick={() => setPage(cur - 1)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next page" disabled={cur === pages} onClick={() => setPage(cur + 1)}>
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ======================================================================
 * Advanced data table — Excel/Airtable-style column-header filters
 * ====================================================================== */

export type FilterKind = "text" | "number" | "date" | "enum" | "boolean";
export type TextOp = "contains" | "notContains" | "equals" | "startsWith" | "endsWith" | "empty" | "notEmpty";
export type NumberOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between";
export type DateOp = "on" | "before" | "after" | "between";
export type DatePreset = "today" | "7d" | "30d" | "month";

/** One column's filter. Dates are stored as `YYYY-MM-DD` strings so a state can be saved as JSON. */
export type FilterValue =
  | { kind: "text"; op: TextOp; value: string }
  | { kind: "number"; op: NumberOp; value?: number; min?: number; max?: number }
  | { kind: "date"; op: DateOp; value?: string; from?: string; to?: string; preset?: DatePreset }
  | { kind: "enum"; values: string[] }
  | { kind: "boolean"; value: boolean };
export type ColumnFilters = Record<string, FilterValue>;
export type TableSort = { key: string; dir: 1 | -1 } | null;
export interface TableViewState {
  filters: ColumnFilters;
  sort: TableSort;
  query: string;
  hidden: string[];
  pinned: string[];
}
export interface TableView {
  name: string;
  state: Partial<TableViewState>;
}

const TEXT_OPS: [TextOp, string][] = [
  ["contains", "มีคำว่า"], ["notContains", "ไม่มีคำว่า"], ["equals", "เท่ากับ"], ["startsWith", "ขึ้นต้นด้วย"], ["endsWith", "ลงท้ายด้วย"], ["empty", "ว่าง"], ["notEmpty", "ไม่ว่าง"],
];
const NUMBER_OPS: [NumberOp, string, string][] = [
  ["eq", "เท่ากับ (=)", "="], ["neq", "ไม่เท่ากับ (≠)", "≠"], ["gt", "มากกว่า (>)", ">"], ["gte", "มากกว่าหรือเท่ากับ (≥)", "≥"], ["lt", "น้อยกว่า (<)", "<"], ["lte", "น้อยกว่าหรือเท่ากับ (≤)", "≤"], ["between", "ระหว่าง", ""],
];
const DATE_OPS: [DateOp, string][] = [["on", "ในวันที่"], ["before", "ก่อนวันที่"], ["after", "หลังวันที่"], ["between", "ระหว่าง"]];
const DATE_PRESETS: [DatePreset, string][] = [["today", "วันนี้"], ["7d", "7 วันล่าสุด"], ["30d", "30 วันล่าสุด"], ["month", "เดือนนี้"]];

/* ---------- filter logic ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISODate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d);
};
const asDate = (v: unknown) => {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
function presetRange(p: DatePreset): [Date, Date] {
  const t = startOfDay(new Date());
  const back = (n: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate() - n);
  if (p === "today") return [t, t];
  if (p === "7d") return [back(6), t];
  if (p === "30d") return [back(29), t];
  return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 0)];
}

/** Whether a filter actually narrows anything (a text filter with no value, say, doesn't). */
export function isFilterActive(f?: FilterValue): boolean {
  if (!f) return false;
  switch (f.kind) {
    case "text":
      return f.op === "empty" || f.op === "notEmpty" || f.value.trim() !== "";
    case "number":
      return f.op === "between" ? f.min != null || f.max != null : f.value != null;
    case "date":
      return !!f.preset || (f.op === "between" ? !!f.from : !!f.value);
    case "enum":
      return f.values.length > 0;
    case "boolean":
      return true;
  }
}

/** Tests one raw cell value against a filter. */
export function matchesFilter(f: FilterValue, raw: unknown): boolean {
  switch (f.kind) {
    case "text": {
      const s = raw == null ? "" : String(raw).trim().toLowerCase();
      const q = f.value.trim().toLowerCase();
      switch (f.op) {
        case "contains": return s.includes(q);
        case "notContains": return !s.includes(q);
        case "equals": return s === q;
        case "startsWith": return s.startsWith(q);
        case "endsWith": return s.endsWith(q);
        case "empty": return s === "";
        case "notEmpty": return s !== "";
      }
      return true;
    }
    case "number": {
      const n = typeof raw === "number" ? raw : raw == null || raw === "" ? NaN : Number(raw);
      if (Number.isNaN(n)) return false;
      if (f.op === "between") return (f.min == null || n >= f.min) && (f.max == null || n <= f.max);
      const v = f.value ?? 0;
      switch (f.op) {
        case "eq": return n === v;
        case "neq": return n !== v;
        case "gt": return n > v;
        case "gte": return n >= v;
        case "lt": return n < v;
        case "lte": return n <= v;
      }
      return true;
    }
    case "date": {
      const d = asDate(raw);
      if (!d) return false;
      const t = startOfDay(d).getTime();
      if (f.preset || f.op === "between") {
        const [a, b] = f.preset ? presetRange(f.preset) : [fromISODate(f.from!), fromISODate(f.to ?? f.from!)];
        return t >= a.getTime() && t <= b.getTime();
      }
      const v = fromISODate(f.value!).getTime();
      return f.op === "on" ? t === v : f.op === "before" ? t < v : t > v;
    }
    case "enum":
      return f.values.includes(String(raw));
    case "boolean":
      return Boolean(raw) === f.value;
  }
}

/* ---------- small pieces ---------- */

/** Segmented control with a spring-sliding highlight. */
function Seg<V extends string>({ value, onChange, items, className }: { value: V; onChange: (v: V) => void; items: [V, React.ReactNode][]; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const rect = useIndicator(ref, '[data-active="true"]', value);
  return (
    <div ref={ref} role="radiogroup" className={cn("relative flex rounded-md bg-muted p-0.5", className)}>
      <Indicator rect={rect} className="bg-background shadow-sm" />
      {items.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          data-active={v === value}
          onClick={() => onChange(v)}
          className={cn(
            "relative z-10 flex h-7 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded px-2 text-xs font-medium transition-[color,scale] duration-300 active:scale-95",
            v === value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Two-thumb range slider (min–max). */
function RangeSlider({ min, max, step, value, onValueChange }: { min: number; max: number; step: number; value: [number, number]; onValueChange: (v: [number, number]) => void }) {
  const span = max - min || 1;
  const pa = ((value[0] - min) / span) * 100;
  const pb = ((value[1] - min) / span) * 100;
  const thumb =
    "pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent focus-visible:outline-none " +
    "[&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-[scale] [&::-webkit-slider-thumb]:duration-300 active:[&::-webkit-slider-thumb]:scale-125 active:[&::-webkit-slider-thumb]:cursor-grabbing focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background";
  return (
    <div className="relative h-5">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-secondary" />
      <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary" style={{ left: `${pa}%`, right: `${100 - pb}%` }} />
      <input type="range" aria-label="ค่าต่ำสุด" min={min} max={max} step={step} value={value[0]} onChange={(e) => onValueChange([Math.min(Number(e.target.value), value[1]), value[1]])} className={thumb} />
      <input type="range" aria-label="ค่าสูงสุด" min={min} max={max} step={step} value={value[1]} onChange={(e) => onValueChange([value[0], Math.max(Number(e.target.value), value[0])])} className={thumb} />
    </div>
  );
}

/** A panel anchored to an element, portaled to <body> so the table's scroll box can't clip it. Bottom sheet on phones. */
function FloatingPanel({ anchor, open, onClose, label, children }: { anchor: HTMLElement | null; open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const { mounted } = usePresence(open, 200);
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top?: number; bottom?: number; left: number; maxH: number; mobile: boolean } | null>(null);

  React.useLayoutEffect(() => {
    if (!mounted || !anchor) return;
    const place = () => {
      if (!anchor.isConnected) return;
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw < 640) return setPos({ left: 0, maxH: vh * 0.85, mobile: true });
      const w = 304;
      const left = Math.max(12, Math.min(r.left - 8, vw - w - 12));
      const below = vh - r.bottom - 16;
      const above = r.top - 16;
      if (below >= 380 || below >= above) setPos({ top: r.bottom + 6, left, maxH: below, mobile: false });
      else setPos({ bottom: vh - r.top + 6, left, maxH: above, mobile: false });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [mounted, anchor]);

  React.useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, anchor, onClose]);

  if (!mounted || !pos) return null;
  return createPortal(
    <>
      {pos.mobile && <div className={cn("fixed inset-0 z-50 bg-black/40", open ? "animate-fade-in" : "animate-fade-out")} />}
      <div
        ref={ref}
        role="dialog"
        aria-label={label}
        style={pos.mobile ? { maxHeight: pos.maxH } : { top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: pos.maxH }}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden border bg-background text-foreground shadow-lg",
          pos.mobile ? "inset-x-2 bottom-2 rounded-xl" : cn("w-76 rounded-lg", pos.top != null ? "origin-top" : "origin-bottom"),
          open ? (pos.mobile ? "animate-slide-in-bottom" : "animate-zoom-in") : cn("pointer-events-none", pos.mobile ? "animate-slide-out-bottom" : "animate-zoom-out")
        )}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

/** Keeps removed items around for `ms` (flagged `leaving`) so they can animate out. */
function useLeavingList<I extends { id: string }>(items: I[], ms = 180) {
  const prev = React.useRef(items);
  const [leaving, setLeaving] = React.useState<(I & { index: number })[]>([]);
  const sig = items.map((i) => i.id).join("\u0001");
  React.useEffect(() => {
    const ids = new Set(items.map((i) => i.id));
    const gone = prev.current.flatMap((it, index) => (ids.has(it.id) ? [] : [{ ...it, index }]));
    prev.current = items;
    if (!gone.length) return;
    setLeaving((l) => [...l.filter((x) => !ids.has(x.id) && !gone.some((g) => g.id === x.id)), ...gone]);
    const t = window.setTimeout(() => setLeaving((l) => l.filter((x) => !gone.some((g) => g.id === x.id))), ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const out: (I & { leaving?: boolean })[] = [...items];
  for (const l of leaving) if (!items.some((i) => i.id === l.id)) out.splice(Math.min(l.index, out.length), 0, { ...l, leaving: true });
  return out;
}

/* ---------- per-type filter editors ---------- */
interface EditorProps<T> {
  column: Column<T>;
  filter?: FilterValue;
  onChange: (f: FilterValue | undefined) => void;
  /** Raw values of this column over rows that pass every *other* filter (for counts and bounds). */
  facet: unknown[];
  /** Raw values of this column over all rows. */
  all: unknown[];
  locale: string;
}

const numFmt = (n: number) => n.toLocaleString();
const labelOf = <T,>(c: Column<T>, raw: unknown) => c.options?.find((o) => o.value === String(raw))?.label ?? (c.format ? c.format(raw) : String(raw ?? ""));

function TextEditor<T>({ filter, onChange }: EditorProps<T>) {
  const f = filter?.kind === "text" ? filter : { kind: "text" as const, op: "contains" as TextOp, value: "" };
  const needsValue = f.op !== "empty" && f.op !== "notEmpty";
  return (
    <div className="grid gap-2">
      <Select aria-label="เงื่อนไข" value={f.op} onChange={(e) => onChange({ ...f, op: e.target.value as TextOp })}>
        {TEXT_OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      {needsValue && <Input autoFocus aria-label="ค่า" placeholder="พิมพ์ค่าที่ต้องการ…" value={f.value} onChange={(e) => onChange({ ...f, value: e.target.value })} className="animate-slide-up" />}
    </div>
  );
}

function niceStep(span: number) {
  const raw = span / 100;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? p;
}

function NumberEditor<T>({ column, filter, onChange, all }: EditorProps<T>) {
  const nums = all.map(Number).filter((n) => !Number.isNaN(n));
  const lo = nums.length ? Math.min(...nums) : 0;
  const hi = nums.length ? Math.max(...nums) : 100;
  const step = niceStep(hi - lo);
  const bLo = Math.floor(lo / step) * step;
  const bHi = Math.ceil(hi / step) * step;
  const f = filter?.kind === "number" ? filter : { kind: "number" as const, op: "between" as NumberOp };
  const parse = (s: string) => (s === "" ? undefined : Number(s));
  const fmt = (n: number) => (column.format ? column.format(n) : numFmt(n));
  return (
    <div className="grid gap-2.5">
      <Select aria-label="เงื่อนไข" value={f.op} onChange={(e) => onChange({ ...f, op: e.target.value as NumberOp })}>
        {NUMBER_OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      {f.op === "between" ? (
        <div key="between" className="grid animate-slide-up gap-3">
          <div className="flex items-center gap-2">
            <Input type="number" inputMode="decimal" aria-label="ต่ำสุด" placeholder={String(bLo)} value={f.min ?? ""} onChange={(e) => onChange({ ...f, min: parse(e.target.value) })} />
            <span className="text-muted-foreground">–</span>
            <Input type="number" inputMode="decimal" aria-label="สูงสุด" placeholder={String(bHi)} value={f.max ?? ""} onChange={(e) => onChange({ ...f, max: parse(e.target.value) })} />
          </div>
          <RangeSlider min={bLo} max={bHi} step={step} value={[f.min ?? bLo, f.max ?? bHi]} onValueChange={([a, b]) => onChange({ ...f, min: a <= bLo ? undefined : a, max: b >= bHi ? undefined : b })} />
          <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground"><span>{fmt(bLo)}</span><span>{fmt(bHi)}</span></div>
        </div>
      ) : (
        <div key="single" className="grid animate-slide-up gap-3">
          <Input autoFocus type="number" inputMode="decimal" aria-label="ค่า" placeholder="ระบุตัวเลข" value={f.value ?? ""} onChange={(e) => onChange({ ...f, value: parse(e.target.value) })} />
          <Slider min={bLo} max={bHi} step={step} value={f.value ?? bLo} onValueChange={(v) => onChange({ ...f, value: v })} />
        </div>
      )}
    </div>
  );
}

function DateEditor<T>({ filter, onChange, locale }: EditorProps<T>) {
  const f = filter?.kind === "date" ? filter : { kind: "date" as const, op: "between" as DateOp };
  const range = f.preset ? presetRange(f.preset) : null;
  const calKey = f.preset ?? "custom";
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {DATE_PRESETS.map(([p, l]) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(f.preset === p ? undefined : { kind: "date", op: "between", preset: p })}
            className={cn(
              "h-7 rounded-full border px-2.5 text-xs font-medium transition-[color,background-color,border-color,scale] duration-300 active:scale-95",
              f.preset === p ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <Select aria-label="เงื่อนไข" value={f.op} onChange={(e) => onChange({ kind: "date", op: e.target.value as DateOp, value: f.value ?? f.from, from: f.from ?? f.value, to: f.to })}>
        {DATE_OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      <div className="flex justify-center rounded-md border p-2">
        {f.op === "between" || f.preset ? (
          <Calendar
            key={calKey}
            locale={locale}
            range={range ? { from: range[0], to: range[1] } : { from: f.from ? fromISODate(f.from) : undefined, to: f.to ? fromISODate(f.to) : undefined }}
            onRangeChange={(r) => onChange({ kind: "date", op: "between", from: r.from && toISODate(r.from), to: r.to && toISODate(r.to) })}
          />
        ) : (
          <Calendar key={calKey} locale={locale} value={f.value ? fromISODate(f.value) : null} onValueChange={(d) => onChange({ kind: "date", op: f.op, value: toISODate(d) })} />
        )}
      </div>
    </div>
  );
}

function EnumEditor<T>({ column, filter, onChange, facet, all }: EditorProps<T>) {
  const [q, setQ] = React.useState("");
  const selected = filter?.kind === "enum" ? filter.values : [];
  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const v of facet) m.set(String(v), (m.get(String(v)) ?? 0) + 1);
    return m;
  }, [facet]);
  const options = React.useMemo(() => {
    if (column.options) return column.options;
    const distinct = [...new Set(all.map(String))].sort((a, b) => a.localeCompare(b, "th"));
    return distinct.map((v) => ({ value: v, label: labelOf(column, v) }));
  }, [column, all]);
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const set = (values: string[]) => onChange(values.length ? { kind: "enum", values } : undefined);
  const toggle = (v: string) => set(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="grid gap-2">
      {options.length > 5 && (
        <InputGroup prefix={<SearchIcon />} placeholder="ค้นหาค่า…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
      )}
      <div className="flex items-center justify-between text-xs">
        <button type="button" className="font-medium text-primary transition-[opacity,scale] hover:opacity-80 active:scale-95" onClick={() => set([...new Set([...selected, ...shown.map((o) => o.value)])])}>
          เลือกทั้งหมด
        </button>
        <span className="text-muted-foreground">
          เลือก <span key={selected.length} className="inline-block animate-pop-sm tabular-nums">{selected.length}</span> จาก {options.length}
        </span>
        <button type="button" className="font-medium text-muted-foreground transition-[color,scale] hover:text-foreground active:scale-95 disabled:opacity-40" disabled={!selected.length} onClick={() => set([])}>
          ล้าง
        </button>
      </div>
      <div className="-mx-1 max-h-56 overflow-y-auto overscroll-contain">
        {shown.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">ไม่พบค่าที่ค้นหา</p>}
        {shown.map((o) => {
          const n = counts.get(o.value) ?? 0;
          return (
            <Checkbox
              key={o.value}
              checked={selected.includes(o.value)}
              onChange={() => toggle(o.value)}
              className={cn("flex w-full rounded-md px-2 py-1.5 transition-colors hover:bg-accent", n === 0 && !selected.includes(o.value) && "opacity-50")}
              label={
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{o.label}</span>
                  <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{n}</span>
                </span>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function BooleanEditor<T>({ column, filter, onChange, facet }: EditorProps<T>) {
  const [yes, no] = column.booleanLabels ?? ["ใช่", "ไม่ใช่"];
  const cur = filter?.kind === "boolean" ? (filter.value ? "true" : "false") : "all";
  const nTrue = facet.filter(Boolean).length;
  const count = (n: number) => <span className="text-[11px] tabular-nums opacity-60">{n}</span>;
  return (
    <Seg
      value={cur}
      onChange={(v) => onChange(v === "all" ? undefined : { kind: "boolean", value: v === "true" })}
      items={[["all", <>ทั้งหมด {count(facet.length)}</>], ["true", <>{yes} {count(nTrue)}</>], ["false", <>{no} {count(facet.length - nTrue)}</>]]}
    />
  );
}

const EDITORS = { text: TextEditor, number: NumberEditor, date: DateEditor, enum: EnumEditor, boolean: BooleanEditor } as const;

/** Short human summary of a filter, for chips ("≥ ฿1,000", "ชำระแล้ว, รอดำเนินการ"). */
export function describeFilter<T>(c: Column<T>, f: FilterValue, locale = "th-TH"): string {
  const d = (s: string) => fromISODate(s).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const n = (v: number) => (c.format ? c.format(v) : numFmt(v));
  switch (f.kind) {
    case "text": {
      const op = TEXT_OPS.find(([o]) => o === f.op)![1];
      return f.op === "empty" || f.op === "notEmpty" ? op : `${op} “${f.value.trim()}”`;
    }
    case "number":
      if (f.op === "between") return f.min != null && f.max != null ? `${n(f.min)} – ${n(f.max)}` : f.min != null ? `≥ ${n(f.min)}` : `≤ ${n(f.max!)}`;
      return `${NUMBER_OPS.find(([o]) => o === f.op)![2]} ${n(f.value!)}`;
    case "date":
      if (f.preset) return DATE_PRESETS.find(([p]) => p === f.preset)![1];
      if (f.op === "between") return f.to && f.to !== f.from ? `${d(f.from!)} – ${d(f.to)}` : d(f.from!);
      return `${DATE_OPS.find(([o]) => o === f.op)![1].replace("วันที่", "").trim()} ${d(f.value!)}`.replace(/^ใน /, "");
    case "enum": {
      const labels = f.values.map((v) => labelOf(c, v));
      return labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(", ");
    }
    case "boolean":
      return (c.booleanLabels ?? ["ใช่", "ไม่ใช่"])[f.value ? 0 : 1];
  }
}

/* ---------- header menu ---------- */
function sortLabels(kind?: FilterKind): [string, string] {
  if (kind === "number") return ["น้อย → มาก", "มาก → น้อย"];
  if (kind === "date") return ["เก่า → ใหม่", "ใหม่ → เก่า"];
  return ["ก → ฮ", "ฮ → ก"];
}

interface ColumnMenuProps<T> extends EditorProps<T> {
  sortDir: 0 | 1 | -1;
  onSort: (dir: 0 | 1 | -1) => void;
  pinned: boolean;
  onPin: () => void;
  onHide?: () => void;
  onClose: () => void;
}

function ColumnMenu<T>(props: ColumnMenuProps<T>) {
  const { column: c, filter, onChange, sortDir, onSort, pinned, onPin, onHide, onClose } = props;
  const Editor = c.filter ? (EDITORS[c.filter] as (p: EditorProps<T>) => React.ReactNode) : null;
  const [asc, desc] = sortLabels(c.filter);
  const active = isFilterActive(filter);
  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <p className="text-sm font-semibold">{c.header}</p>
        <button type="button" aria-label="ปิด" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,scale] hover:bg-accent hover:text-foreground active:scale-90">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain p-3">
        {c.sortable && (
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">เรียงลำดับ</p>
            <Seg
              value={String(sortDir) as "0" | "1" | "-1"}
              onChange={(v) => onSort(Number(v) as 0 | 1 | -1)}
              items={[
                ["1", <><ArrowUpNarrowWide className="h-3.5 w-3.5" />{asc}</>],
                ["-1", <><ArrowDownWideNarrow className="h-3.5 w-3.5" />{desc}</>],
                ["0", "ไม่เรียง"],
              ]}
            />
          </div>
        )}
        {Editor && (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">ตัวกรอง</p>
              {active && <span className="animate-zoom-in rounded-full bg-primary/10 px-2 text-[11px] font-medium text-primary">ใช้งานอยู่</span>}
            </div>
            <Editor {...props} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 border-t p-2">
        <Button variant="ghost" size="sm" onClick={onPin} className="px-2">
          {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          {pinned ? "เลิกปักหมุด" : "ปักหมุดซ้าย"}
        </Button>
        {onHide && (
          <Button variant="ghost" size="sm" onClick={onHide} className="px-2">
            <EyeOff className="h-3.5 w-3.5" />
            ซ่อน
          </Button>
        )}
        {Editor && (
          <Button variant="ghost" size="sm" disabled={!filter} onClick={() => onChange(undefined)} className="ml-auto px-2 text-destructive hover:text-destructive">
            <FunnelX className="h-3.5 w-3.5" />
            ล้าง
          </Button>
        )}
      </div>
    </>
  );
}

/* ---------- inline filter row ---------- */
function InlineFilter<T>({ column: c, filter, onChange, all }: EditorProps<T>) {
  const cls = "h-8 text-xs font-normal text-foreground";
  switch (c.filter) {
    case "text": {
      const f = filter?.kind === "text" ? filter : { kind: "text" as const, op: "contains" as TextOp, value: "" };
      return <Input aria-label={`กรอง ${c.header}`} placeholder="มีคำว่า…" value={f.value} onChange={(e) => onChange({ ...f, value: e.target.value })} className={cn(cls, "min-w-28")} />;
    }
    case "number": {
      const f = filter?.kind === "number" && filter.op === "between" ? filter : { kind: "number" as const, op: "between" as NumberOp };
      const p = (s: string) => (s === "" ? undefined : Number(s));
      return (
        <div className="flex min-w-40 items-center gap-1">
          <Input type="number" aria-label={`${c.header} ต่ำสุด`} placeholder="ต่ำสุด" value={f.min ?? ""} onChange={(e) => onChange({ ...f, min: p(e.target.value) })} className={cn(cls, "px-2")} />
          <Input type="number" aria-label={`${c.header} สูงสุด`} placeholder="สูงสุด" value={f.max ?? ""} onChange={(e) => onChange({ ...f, max: p(e.target.value) })} className={cn(cls, "px-2")} />
        </div>
      );
    }
    case "date": {
      const cur = filter?.kind === "date" ? filter.preset ?? "custom" : "";
      return (
        <Select aria-label={`กรอง ${c.header}`} value={cur} onChange={(e) => onChange(e.target.value ? { kind: "date", op: "between", preset: e.target.value as DatePreset } : undefined)} className={cn(cls, "min-w-32")}>
          <option value="">ทุกวันที่</option>
          {DATE_PRESETS.map(([p, l]) => <option key={p} value={p}>{l}</option>)}
          {cur === "custom" && <option value="custom" disabled>กำหนดเอง</option>}
        </Select>
      );
    }
    case "enum": {
      const vals = filter?.kind === "enum" ? filter.values : [];
      const opts = c.options ?? [...new Set(all.map(String))].sort((a, b) => a.localeCompare(b, "th")).map((v) => ({ value: v, label: labelOf(c, v) }));
      return (
        <Select aria-label={`กรอง ${c.header}`} value={vals.length === 1 ? vals[0] : vals.length ? "__many" : ""} onChange={(e) => onChange(e.target.value ? { kind: "enum", values: [e.target.value] } : undefined)} className={cn(cls, "min-w-32")}>
          <option value="">ทั้งหมด</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {vals.length > 1 && <option value="__many" disabled>{vals.length} ค่า</option>}
        </Select>
      );
    }
    case "boolean": {
      const [yes, no] = c.booleanLabels ?? ["ใช่", "ไม่ใช่"];
      return (
        <Select aria-label={`กรอง ${c.header}`} value={filter?.kind === "boolean" ? String(filter.value) : ""} onChange={(e) => onChange(e.target.value ? { kind: "boolean", value: e.target.value === "true" } : undefined)} className={cn(cls, "min-w-24")}>
          <option value="">ทั้งหมด</option>
          <option value="true">{yes}</option>
          <option value="false">{no}</option>
        </Select>
      );
    }
    default:
      return null;
  }
}

/* ---------- saved views ---------- */
const readViews = (key?: string): TableView[] => {
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as TableView[];
  } catch {
    return [];
  }
};
const writeViews = (key: string | undefined, views: TableView[]) => {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(views));
  } catch {
    /* storage unavailable: views live for this session only */
  }
};

/* ---------- the table ---------- */
export interface AdvancedDataTableProps<T> {
  data: T[];
  /** Give a column `filter: "text" | "number" | "date" | "enum" | "boolean"` to get a header filter. */
  columns: Column<T>[];
  rowKey: keyof T;
  pageSize?: number;
  /** Keys the global search looks in. Defaults to every column. */
  searchKeys?: (keyof T & string)[];
  searchPlaceholder?: string;
  selectable?: boolean;
  onSelectionChange?: (keys: unknown[]) => void;
  /** Noun for the result count ("แสดง 12 จาก 48 {itemLabel}"). */
  itemLabel?: string;
  emptyText?: string;
  /** Locale for dates in the calendar and chips. */
  locale?: string;
  /** Initial filters / sort / search / hidden / pinned columns. */
  defaultState?: Partial<TableViewState>;
  /** Called whenever filters, sort, search, hidden or pinned columns change. */
  onStateChange?: (state: TableViewState) => void;
  /** Built-in views shown in the "มุมมอง" menu. */
  views?: TableView[];
  /** localStorage key for user-saved views. Omit to keep saved views in memory only. */
  viewsStorageKey?: string;
  /** Show the inline filter row under the header initially (it can always be toggled). */
  defaultFilterRow?: boolean;
}

const EMPTY_STATE: TableViewState = { filters: {}, sort: null, query: "", hidden: [], pinned: [] };
const stateSig = (s: TableViewState) =>
  JSON.stringify({ ...s, filters: Object.fromEntries(Object.entries(s.filters).filter(([, f]) => isFilterActive(f)).sort(([a], [b]) => a.localeCompare(b))), query: s.query.trim(), hidden: [...s.hidden].sort() });

export function AdvancedDataTable<T extends Record<string, unknown>>({
  data, columns, rowKey, pageSize = 10, searchKeys, searchPlaceholder = "ค้นหาทุกคอลัมน์…", selectable, onSelectionChange, itemLabel = "รายการ",
  emptyText = "ไม่พบรายการที่ตรงกับตัวกรอง", locale = "th-TH", defaultState, onStateChange, views: presetViews = [], viewsStorageKey, defaultFilterRow = false,
}: AdvancedDataTableProps<T>) {
  const [st, setSt] = React.useState<TableViewState>(() => ({ ...EMPTY_STATE, ...defaultState }));
  const { filters, sort, query, hidden, pinned } = st;
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<unknown>>(new Set());
  const [filterRow, setFilterRow] = React.useState(defaultFilterRow);
  const [menu, setMenu] = React.useState<{ key: string; anchor: HTMLElement } | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [saved, setSaved] = React.useState<TableView[]>(() => readViews(viewsStorageKey));
  const [viewName, setViewName] = React.useState("");
  const headerBtns = React.useRef(new Map<string, HTMLButtonElement>());
  const countRef = React.useRef<HTMLSpanElement>(null);

  const update = (patch: Partial<TableViewState>) => {
    setSt((s) => ({ ...s, ...patch }));
    setPage(1);
  };
  const onStateChangeRef = React.useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const mountedState = React.useRef(false);
  React.useEffect(() => {
    if (mountedState.current) onStateChangeRef.current?.(st);
    mountedState.current = true;
  }, [st]);
  const setFilter = (key: string, f: FilterValue | undefined) => {
    const next = { ...filters };
    if (f) next[key] = f;
    else delete next[key];
    update({ filters: next });
  };

  const colMap = React.useMemo(() => new Map(columns.map((c) => [c.key as string, c])), [columns]);
  const raw = React.useCallback((row: T, c: Column<T>) => (c.accessor ? c.accessor(row) : row[c.key]), []);
  const text = React.useCallback(
    (row: T, c: Column<T>) => {
      const v = raw(row, c);
      if (c.options || c.format) return labelOf(c, v);
      if (v instanceof Date) return v.toLocaleDateString(locale, { dateStyle: "medium" });
      return String(v ?? "");
    },
    [raw, locale]
  );

  // Rows passing search + every active filter, optionally ignoring one column (for that column's facet counts).
  const pass = React.useCallback(
    (exclude?: string) => {
      const q = query.trim().toLowerCase();
      const sCols = (searchKeys ?? columns.map((c) => c.key)).map((k) => colMap.get(k)).filter(Boolean) as Column<T>[];
      const active = Object.entries(filters).filter(([k, f]) => k !== exclude && colMap.has(k) && isFilterActive(f));
      return data.filter((row) => (!q || sCols.some((c) => text(row, c).toLowerCase().includes(q))) && active.every(([k, f]) => matchesFilter(f, raw(row, colMap.get(k)!))));
    },
    [data, query, filters, searchKeys, columns, colMap, text, raw]
  );

  const rows = React.useMemo(() => {
    const r = pass();
    const c = sort && colMap.get(sort.key);
    if (!sort || !c) return r;
    const cmp = (x: unknown, y: unknown) => {
      if (x instanceof Date || y instanceof Date || c.filter === "date") return (asDate(x)?.getTime() ?? 0) - (asDate(y)?.getTime() ?? 0);
      if (typeof x === "number" && typeof y === "number") return x - y;
      if (typeof x === "boolean" || typeof y === "boolean") return Number(x) - Number(y);
      return String(x ?? "").localeCompare(String(y ?? ""), "th");
    };
    return [...r].sort((a, b) => cmp(raw(a, c), raw(b, c)) * sort.dir);
  }, [pass, sort, colMap, raw]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pages);
  const view = rows.slice((cur - 1) * pageSize, cur * pageSize);
  const allOnPage = view.length > 0 && view.every((r) => selected.has(r[rowKey]));

  // Visible column order: pinned (in pin order) first.
  const visible = React.useMemo(() => {
    const shown = columns.filter((c) => !hidden.includes(c.key));
    return [...pinned.map((k) => shown.find((c) => c.key === k)).filter(Boolean), ...shown.filter((c) => !pinned.includes(c.key))] as Column<T>[];
  }, [columns, hidden, pinned]);

  // Sticky offsets for pinned columns.
  const thRefs = React.useRef(new Map<string, HTMLTableCellElement>());
  const [offsets, setOffsets] = React.useState<Record<string, number>>({});
  const selTh = React.useRef<HTMLTableCellElement>(null);
  React.useLayoutEffect(() => {
    let x = selTh.current?.offsetWidth ?? 0;
    const next: Record<string, number> = {};
    for (const k of pinned) {
      if (hidden.includes(k)) continue;
      next[k] = x;
      x += thRefs.current.get(k)?.offsetWidth ?? 0;
    }
    setOffsets((o) => (JSON.stringify(o) === JSON.stringify(next) ? o : next));
  });
  const lastPinned = [...pinned].reverse().find((k) => !hidden.includes(k));
  const pinCls = (k: string) =>
    k in offsets ? cn("sticky z-[1] bg-background [tr:hover>&]:bg-muted", k === lastPinned && "shadow-[inset_-1px_0_0_var(--color-border)]") : undefined;

  // Rows: FLIP-move survivors, spring new ones in.
  const rowEls = React.useRef(new Map<string, HTMLTableRowElement>());
  const prevTops = React.useRef(new Map<string, number>());
  const viewSig = view.map((r) => String(r[rowKey])).join("|");
  React.useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const ease = springEasing("snappy");
    const next = new Map<string, number>();
    let fresh = 0;
    rowEls.current.forEach((el, k) => {
      const top = el.offsetTop;
      next.set(k, top);
      if (reduce) return;
      const prev = prevTops.current.get(k);
      if (prev == null) {
        el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 500, delay: Math.min(fresh++, 10) * 28, easing: ease, fill: "backwards" });
      } else if (prev !== top) {
        el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: "none" }], { duration: 550, easing: ease });
      }
    });
    prevTops.current = next;
  }, [viewSig]);

  // Result count "bumps" when it changes.
  const firstCount = React.useRef(true);
  React.useEffect(() => {
    if (firstCount.current) return void (firstCount.current = false);
    bump(countRef.current, 1.08);
  }, [rows.length]);

  const commitSel = (next: Set<unknown>) => {
    setSelected(next);
    onSelectionChange?.([...next]);
  };
  const toggleRow = (k: unknown) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    commitSel(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    view.forEach((r) => (allOnPage ? next.delete(r[rowKey]) : next.add(r[rowKey])));
    commitSel(next);
  };

  const openMenu = (key: string, anchor: HTMLElement) => {
    if (menuOpen && menu?.key === key && menu.anchor === anchor) return setMenuOpen(false);
    setMenu({ key, anchor });
    setMenuOpen(true);
  };
  const closeMenu = React.useCallback(() => setMenuOpen(false), []);
  const setSortDir = (key: string, dir: 0 | 1 | -1) => update({ sort: dir ? { key, dir } : null });
  const cycleSort = (key: string) => update({ sort: !sort || sort.key !== key ? { key, dir: 1 } : sort.dir === 1 ? { key, dir: -1 } : null });
  const togglePin = (key: string) => update({ pinned: pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key] });
  const hideCol = (key: string) => {
    update({ hidden: [...hidden, key], pinned: pinned.filter((k) => k !== key) });
    if (menu?.key === key) setMenuOpen(false);
  };
  const clearAll = () => update({ filters: {}, query: "" });

  // Chips
  const chips = useLeavingList([
    ...(query.trim() ? [{ id: "__q", label: "ค้นหา", summary: `“${query.trim()}”` }] : []),
    ...columns.filter((c) => isFilterActive(filters[c.key])).map((c) => ({ id: c.key as string, label: c.header, summary: describeFilter(c, filters[c.key]!, locale) })),
  ]);
  const activeCount = chips.filter((c) => !c.leaving).length;

  // Views
  const allViews = [...presetViews.map((v) => ({ ...v, builtin: true })), ...saved.map((v) => ({ ...v, builtin: false }))];
  const curSig = stateSig(st);
  const applyView = (v: TableView) => update({ ...EMPTY_STATE, ...v.state });
  const saveView = () => {
    const name = viewName.trim() || `มุมมอง ${saved.length + 1}`;
    const next = [...saved.filter((v) => v.name !== name), { name, state: { ...st, query: st.query.trim() } }];
    setSaved(next);
    writeViews(viewsStorageKey, next);
    setViewName("");
  };
  const deleteView = (name: string) => {
    const next = saved.filter((v) => v.name !== name);
    setSaved(next);
    writeViews(viewsStorageKey, next);
  };

  const menuCol = menu ? colMap.get(menu.key) : undefined;
  const colSpan = visible.length + (selectable ? 1 : 0);
  const filterable = columns.some((c) => c.filter);

  return (
    <div className="grid min-w-0 gap-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup
          prefix={<SearchIcon />}
          suffix={
            query && (
              <button type="button" aria-label="ล้างคำค้นหา" onClick={() => update({ query: "" })} className="animate-zoom-in transition-[color,scale] hover:text-foreground active:scale-90">
                <X className="h-3.5 w-3.5" />
              </button>
            )
          }
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => update({ query: e.target.value })}
          className="min-w-0 flex-1 basis-56 sm:max-w-xs"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {filterable && (
            <Button variant={filterRow ? "secondary" : "outline"} size="sm" aria-pressed={filterRow} onClick={() => setFilterRow(!filterRow)}>
              <Rows3 className="h-3.5 w-3.5" />
              แถวตัวกรอง
            </Button>
          )}
          <Popover
            className="left-auto right-0 w-60 origin-top-right p-2"
            trigger={
              <Button variant="outline" size="sm">
                <Columns3 className="h-3.5 w-3.5" />
                คอลัมน์
                {hidden.length > 0 && <span key={hidden.length} className="animate-spring-in rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground tabular-nums">{columns.length - hidden.length}/{columns.length}</span>}
              </Button>
            }
          >
            <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">แสดงคอลัมน์</p>
            {columns.map((c) => (
              <Checkbox
                key={c.key}
                checked={!hidden.includes(c.key)}
                disabled={c.hideable === false || (!hidden.includes(c.key) && hidden.length === columns.length - 1)}
                onChange={() => (hidden.includes(c.key) ? update({ hidden: hidden.filter((k) => k !== c.key) }) : hideCol(c.key))}
                className="flex w-full rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
                label={
                  <span className="flex flex-1 items-center justify-between">
                    {c.header}
                    {pinned.includes(c.key) && <Pin className="h-3 w-3 text-muted-foreground" />}
                  </span>
                }
              />
            ))}
            <div className="mt-1 border-t pt-1">
              <Button variant="ghost" size="sm" className="w-full justify-start px-2" disabled={!hidden.length && !pinned.length} onClick={() => update({ hidden: [], pinned: [] })}>
                แสดงทั้งหมดและเลิกปักหมุด
              </Button>
            </div>
          </Popover>
          <Popover
            className="left-auto right-0 w-72 max-w-[calc(100vw-2rem)] origin-top-right p-2"
            trigger={
              <Button variant="outline" size="sm">
                <Bookmark className="h-3.5 w-3.5" />
                มุมมอง
              </Button>
            }
          >
            <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">มุมมองที่บันทึกไว้</p>
            {allViews.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">ยังไม่มีมุมมอง ลองตั้งตัวกรองแล้วบันทึกด้านล่าง</p>}
            <div className="grid">
              {allViews.map((v) => {
                const on = stateSig({ ...EMPTY_STATE, ...v.state }) === curSig;
                return (
                  <div key={(v.builtin ? "b:" : "u:") + v.name} className={cn("group flex animate-slide-up items-center rounded-md transition-colors", on ? "bg-accent" : "hover:bg-accent")}>
                    <button type="button" onClick={() => applyView(v)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm transition-[scale] active:scale-[0.98]">
                      <Bookmark className={cn("h-3.5 w-3.5 shrink-0 transition-[color,fill]", on ? "fill-primary text-primary" : "text-muted-foreground")} />
                      <span className="truncate">{v.name}</span>
                      {v.builtin && <span className="ml-auto text-[10px] text-muted-foreground">ค่าเริ่มต้น</span>}
                    </button>
                    {!v.builtin && (
                      <button type="button" aria-label={`ลบมุมมอง ${v.name}`} onClick={() => deleteView(v.name)} className="mr-1 flex h-7 w-7 items-center justify-center rounded text-muted-foreground opacity-60 transition-[color,opacity,scale] hover:text-destructive hover:opacity-100 active:scale-90">
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <form
              className="mt-2 flex gap-1.5 border-t pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveView();
              }}
            >
              <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="ตั้งชื่อมุมมองนี้…" aria-label="ชื่อมุมมอง" className="h-8 text-xs" />
              <Button type="submit" size="sm" className="shrink-0 px-2.5">
                <BookmarkPlus className="h-3.5 w-3.5" />
                บันทึก
              </Button>
            </form>
          </Popover>
        </div>
      </div>

      {/* result count + active filter chips */}
      <div className="flex min-h-8 flex-wrap items-center gap-1.5 text-sm">
        <span ref={countRef} className="mr-1 inline-flex items-center gap-1 text-muted-foreground" aria-live="polite">
          แสดง <RollingNumber value={rows.length} className="font-semibold text-foreground" /> จาก {data.length.toLocaleString()} {itemLabel}
        </span>
        {chips.map((c) => (
          <span
            key={c.id}
            className={cn(
              "inline-flex h-7 max-w-full items-center overflow-hidden rounded-full border border-primary/25 bg-primary/10 text-xs text-foreground",
              c.leaving ? "pointer-events-none animate-zoom-out" : "animate-spring-in"
            )}
          >
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 py-1 pl-2.5 pr-1 transition-[opacity] hover:opacity-80"
              onClick={(e) => (c.id === "__q" ? undefined : openMenu(c.id, headerBtns.current.get(c.id)?.isConnected ? headerBtns.current.get(c.id)! : e.currentTarget))}
            >
              <span className="font-medium">{c.label}:</span>
              <span key={c.summary} className="truncate text-muted-foreground">{c.summary}</span>
            </button>
            <button
              type="button"
              aria-label={`ลบตัวกรอง ${c.label}`}
              onClick={() => (c.id === "__q" ? update({ query: "" }) : setFilter(c.id, undefined))}
              className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,scale] hover:bg-primary/15 hover:text-foreground active:scale-90"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {activeCount > 1 && (
          <button type="button" onClick={clearAll} className="h-7 animate-zoom-in rounded-full px-2.5 text-xs font-medium text-destructive transition-[background-color,scale] hover:bg-destructive/10 active:scale-95">
            ล้างทั้งหมด
          </button>
        )}
      </div>

      <Table>
        <thead>
          <tr>
            {selectable && (
              <th ref={selTh} className={cn("w-12", pinned.length && "sticky left-0 z-[1] bg-background")}>
                <Checkbox checked={allOnPage} onChange={toggleAll} aria-label="เลือกทั้งหมดในหน้านี้" />
              </th>
            )}
            {visible.map((c) => {
              const dir = sort?.key === c.key ? sort.dir : 0;
              const f = filters[c.key];
              const on = isFilterActive(f);
              const badge = on ? (f!.kind === "enum" ? f!.values.length : 1) : 0;
              const right = c.align === "right";
              const hasMenu = !!(c.filter || c.sortable || c.hideable !== false);
              return (
                <th
                  key={c.key}
                  ref={(el) => {
                    if (el) thRefs.current.set(c.key, el);
                    else thRefs.current.delete(c.key);
                  }}
                  style={{ textAlign: c.align ?? "left", left: offsets[c.key] }}
                  aria-sort={dir === 1 ? "ascending" : dir === -1 ? "descending" : undefined}
                  className={cn(pinCls(c.key), "!pr-2")}
                >
                  <div className={cn("flex items-center gap-1", right && "flex-row-reverse")}>
                    {c.sortable ? (
                      <button type="button" onClick={() => cycleSort(c.key)} className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", (dir || on) && "text-foreground", right && "flex-row-reverse")}>
                        {pinned.includes(c.key) && <Pin className="h-3 w-3 rotate-45 text-primary" />}
                        {c.header}
                        <span key={dir} className="flex animate-zoom-in">
                          {dir === 1 ? <ArrowUpIcon className="h-3.5 w-3.5" /> : dir === -1 ? <ArrowDownIcon className="h-3.5 w-3.5" /> : <ArrowUpDownIcon className="h-3.5 w-3.5 opacity-40" />}
                        </span>
                      </button>
                    ) : (
                      <span className={cn("inline-flex items-center gap-1", on && "text-foreground")}>
                        {pinned.includes(c.key) && <Pin className="h-3 w-3 rotate-45 text-primary" />}
                        {c.header}
                      </span>
                    )}
                    {hasMenu && (
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) headerBtns.current.set(c.key, el);
                          else headerBtns.current.delete(c.key);
                        }}
                        aria-label={c.filter ? `ตัวกรอง ${c.header}` : `ตัวเลือก ${c.header}`}
                        aria-haspopup="dialog"
                        aria-expanded={menuOpen && menu?.key === c.key}
                        onClick={(e) => openMenu(c.key, e.currentTarget)}
                        className={cn(
                          "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-[color,background-color,scale] duration-300 hover:bg-accent hover:text-foreground active:scale-90",
                          on ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "text-muted-foreground/70",
                          menuOpen && menu?.key === c.key && !on && "bg-accent text-foreground"
                        )}
                      >
                        {c.filter ? <ListFilter className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {badge > 0 && (
                          <span key={badge} className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 animate-spring-in items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold leading-none text-primary-foreground ring-2 ring-background">
                            {badge}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
          {filterRow && (
            <tr className="animate-slide-up bg-muted/30">
              {selectable && <th className={cn(pinned.length && "sticky left-0 z-[1] bg-background")} />}
              {visible.map((c) => (
                <th key={c.key} style={{ left: offsets[c.key] }} className={cn(pinCls(c.key), "!h-auto !px-2 py-1.5")}>
                  {c.filter && <InlineFilter column={c} filter={filters[c.key]} onChange={(f) => setFilter(c.key, f)} facet={[]} all={data.map((r) => raw(r, c))} locale={locale} />}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {view.length === 0 ? (
            <tr className="hover:!bg-transparent">
              <td colSpan={colSpan}>
                <div className="flex animate-zoom-in flex-col items-center gap-1.5 px-4 py-10 text-center whitespace-normal">
                  <div className="mb-2 flex h-12 w-12 animate-float items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <SearchX className="h-5 w-5" />
                  </div>
                  <p className="font-medium">{emptyText}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">ลองลดเงื่อนไขหรือเปลี่ยนคำค้นหา</p>
                  {activeCount > 0 && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={clearAll}>
                      <FunnelX className="h-3.5 w-3.5" />
                      ล้างตัวกรองทั้งหมด
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ) : (
            view.map((row) => {
              const k = row[rowKey];
              const isSel = selected.has(k);
              return (
                <tr
                  key={String(k)}
                  ref={(el) => {
                    if (el) rowEls.current.set(String(k), el);
                    else rowEls.current.delete(String(k));
                  }}
                  className={cn("relative", isSel && "bg-muted/50")}
                >
                  {selectable && (
                    <td className={cn(pinned.length && "sticky left-0 z-[1] bg-background [tr:hover>&]:bg-muted")}>
                      <Checkbox checked={isSel} onChange={() => toggleRow(k)} aria-label={`เลือก ${String(k)}`} />
                    </td>
                  )}
                  {visible.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align ?? "left", left: offsets[c.key] }} className={cn(pinCls(c.key), c.align === "right" && "tabular-nums")}>
                      {c.render ? c.render(row) : text(row, c)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{selectable && selected.size > 0 ? <>เลือกแล้ว <span key={selected.size} className="inline-block animate-pop-sm tabular-nums text-foreground">{selected.size}</span> {itemLabel}</> : `${rows.length.toLocaleString()} ${itemLabel}`}</span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">หน้า {cur} / {pages}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="หน้าก่อนหน้า" disabled={cur === 1} onClick={() => setPage(cur - 1)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="หน้าถัดไป" disabled={cur === pages} onClick={() => setPage(cur + 1)}>
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <FloatingPanel anchor={menu?.anchor ?? null} open={menuOpen && !!menuCol} onClose={closeMenu} label={menuCol ? `ตัวเลือกคอลัมน์ ${menuCol.header}` : "ตัวเลือกคอลัมน์"}>
        {menuCol && (
          <ColumnMenu
            key={menuCol.key}
            column={menuCol}
            filter={filters[menuCol.key]}
            onChange={(f) => setFilter(menuCol.key, f)}
            facet={pass(menuCol.key).map((r) => raw(r, menuCol))}
            all={data.map((r) => raw(r, menuCol))}
            locale={locale}
            sortDir={sort?.key === menuCol.key ? sort.dir : 0}
            onSort={(d) => setSortDir(menuCol.key, d)}
            pinned={pinned.includes(menuCol.key)}
            onPin={() => togglePin(menuCol.key)}
            onHide={menuCol.hideable === false || hidden.length === columns.length - 1 ? undefined : () => hideCol(menuCol.key)}
            onClose={closeMenu}
          />
        )}
      </FloatingPanel>
    </div>
  );
}
