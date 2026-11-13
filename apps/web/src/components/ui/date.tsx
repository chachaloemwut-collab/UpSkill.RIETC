"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldClass } from "./field";
import { usePresence } from "./overlay";
import { SmartSelect, useAnchoredPanel, useLayerDismiss, type SelectOption } from "./smart-select";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from "./icons";

/*
 * Dates and times, drawn entirely by the system (no native date/time popups).
 *  - Calendar: month grid; optional month/year dropdowns, min/max
 *  - DateField / TimeField: string values like <input type="date|time"> ("2026-10-01", "08:30"), with a panel
 *    that also accepts typed text: "18/4/2535", "5 ต.ค.", "พรุ่งนี้", "+7", "830", "บ่าย 2"…
 *  - DatePicker: the Date-object version of DateField
 * <Input type="date"> and <Input type="time"> render these automatically.
 */

export interface DateRange {
  from?: Date;
  to?: Date;
}

const sameDay = (a?: Date | null, b?: Date | null) => !!a && !!b && a.toDateString() === b.toDateString();
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const pad = (n: number) => String(n).padStart(2, "0");

export const toISODateString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function fromISODateString(s?: string | null): Date | null {
  const m = s && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  return d.getMonth() === +m[2]! - 1 ? d : null;
}

/* ---------- Calendar ---------- */
interface CalendarProps {
  value?: Date | null;
  onValueChange?: (d: Date) => void;
  range?: DateRange;
  onRangeChange?: (r: DateRange) => void;
  locale?: string;
  className?: string;
  /** Controlled visible month (any day in it). */
  month?: Date;
  onMonthChange?: (d: Date) => void;
  /** Show month and year as dropdowns instead of a plain caption (handy for birthdays). */
  captionDropdowns?: boolean;
  fromYear?: number;
  toYear?: number;
  min?: Date | null;
  max?: Date | null;
}

export function Calendar({ value, onValueChange, range, onRangeChange, locale = "en-US", className, month, onMonthChange, captionDropdowns, fromYear, toYear, min, max }: CalendarProps) {
  const [innerView, setInnerView] = React.useState(() => monthStart(value ?? range?.from ?? new Date()));
  const view = month ? monthStart(month) : innerView;
  const [dir, setDir] = React.useState(0);
  const today = new Date();
  const first = monthStart(view);
  const days = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + i));
  const weekdays = days.slice(0, 7).map((d) => d.toLocaleDateString(locale, { weekday: "narrow" }));
  const go = (d: Date, n: number) => {
    setDir(n);
    if (!month) setInnerView(monthStart(d));
    onMonthChange?.(monthStart(d));
  };
  const shift = (n: number) => go(new Date(view.getFullYear(), view.getMonth() + n, 1), n);
  const lo = min ? dayStart(min) : null;
  const hi = max ? dayStart(max) : null;
  const blocked = (d: Date) => (!!lo && d < lo) || (!!hi && d > hi);

  const pick = (d: Date) => {
    if (blocked(d)) return;
    if (!onRangeChange) return onValueChange?.(d);
    if (!range?.from || range.to) onRangeChange({ from: d });
    else if (d < range.from) onRangeChange({ from: d, to: range.from });
    else onRangeChange({ from: range.from, to: d });
  };

  const y0 = fromYear ?? today.getFullYear() - 100;
  const y1 = toYear ?? today.getFullYear() + 10;
  const monthOpts = React.useMemo<SelectOption[]>(
    () => Array.from({ length: 12 }, (_, m) => ({ value: String(m), label: new Date(2000, m, 1).toLocaleDateString(locale, { month: "long" }), keywords: [new Date(2000, m, 1).toLocaleDateString("en-US", { month: "long" }), String(m + 1)] })),
    [locale]
  );
  const yearOpts = React.useMemo<SelectOption[]>(
    () =>
      Array.from({ length: y1 - y0 + 1 }, (_, i) => {
        const y = y1 - i;
        const label = new Date(y, 0, 1).toLocaleDateString(locale, { year: "numeric" }).replace(/[^\d]/g, "") || String(y);
        return { value: String(y), label, keywords: [String(y), String(y + 543)] };
      }),
    [locale, y0, y1]
  );

  const navBtn = "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-[color,background-color,scale] hover:bg-accent hover:text-foreground active:scale-90";
  return (
    <div className={cn("w-fit select-none", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => shift(-1)} className={navBtn}>
          <ChevronLeftIcon />
        </button>
        {captionDropdowns ? (
          <div className="flex min-w-0 flex-1 gap-1.5">
            <SmartSelect
              size="sm"
              aria-label="เดือน"
              searchable={false}
              options={monthOpts}
              value={String(view.getMonth())}
              onValueChange={(v) => go(new Date(view.getFullYear(), +v, 1), +v > view.getMonth() ? 1 : -1)}
              className="font-medium"
            />
            <SmartSelect
              size="sm"
              aria-label="ปี"
              options={yearOpts}
              searchPlaceholder="พิมพ์ปี พ.ศ. หรือ ค.ศ."
              value={String(view.getFullYear())}
              onValueChange={(v) => go(new Date(+v, view.getMonth(), 1), +v > view.getFullYear() ? 1 : -1)}
              className="w-[5.5rem] shrink-0 font-medium"
            />
          </div>
        ) : (
          <span key={view.getTime()} className={cn("text-sm font-medium", dir > 0 && "animate-next", dir < 0 && "animate-prev")}>{view.toLocaleDateString(locale, { month: "long", year: "numeric" })}</span>
        )}
        <button type="button" aria-label="เดือนถัดไป" onClick={() => shift(1)} className={navBtn}>
          <ChevronRightIcon />
        </button>
      </div>
      <div role="grid" key={view.getTime()} className={cn("grid grid-cols-7 gap-y-1 text-center", dir > 0 && "animate-next", dir < 0 && "animate-prev")}>
        {weekdays.map((w, i) => (
          <span key={i} className="pb-1 text-xs font-normal text-muted-foreground">{w}</span>
        ))}
        {days.map((d) => {
          const outside = d.getMonth() !== view.getMonth();
          const isStart = sameDay(d, range?.from);
          const isEnd = sameDay(d, range?.to);
          const inRange = !!range?.from && !!range.to && d > range.from && d < range.to;
          const selected = sameDay(d, value) || isStart || isEnd;
          const off = blocked(d);
          return (
            <div key={d.toISOString()} className={cn(inRange && "bg-accent", isStart && range?.to && "rounded-l-md bg-accent", isEnd && "rounded-r-md bg-accent")}>
              <button
                type="button"
                role="gridcell"
                aria-selected={selected}
                aria-disabled={off || undefined}
                aria-label={d.toLocaleDateString(locale, { dateStyle: "full" })}
                onClick={() => pick(d)}
                className={cn(
                  "relative h-9 w-9 rounded-md text-sm tabular-nums transition-[color,background-color,scale] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  off ? "cursor-not-allowed text-muted-foreground/35 line-through" : "hover:bg-accent active:scale-90",
                  outside && !off && "text-muted-foreground/50",
                  selected && "bg-primary text-primary-foreground hover:bg-primary",
                  sameDay(d, today) && !selected && "font-semibold after:absolute after:bottom-1.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-foreground"
                )}
              >
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- free-text parsing ---------- */
const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TH_ABBR = ["มค", "กพ", "มีค", "เมย", "พค", "มิย", "กค", "สค", "กย", "ตค", "พย", "ธค"];
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthFromWord(w: string): number {
  const s = w.toLowerCase().replace(/[.\s]/g, "");
  if (!s) return -1;
  let i = TH_ABBR.indexOf(s);
  if (i >= 0) return i;
  i = TH_MONTHS.findIndex((m) => m.startsWith(s) && s.length >= 2);
  if (i >= 0) return i;
  return EN_MONTHS.findIndex((m) => s.startsWith(m));
}

function fixYear(y: number, now: Date) {
  if (y >= 2400) return y - 543; // พ.ศ.
  if (y < 100) {
    const be = 2500 + y - 543; // "35" → 2535 → 1992
    return be <= now.getFullYear() + 10 ? be : 1900 + y;
  }
  return y;
}

/**
 * Reads a date typed the way people type them: "18/4/2535", "18-04-1992", "18 เม.ย. 35", "5 ต.ค.",
 * "2026-10-01", "วันนี้", "พรุ่งนี้", "เมื่อวาน", "+7" (days), "+2 สัปดาห์", "-1 เดือน".
 */
export function parseDateText(input: string, now = new Date()): Date | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const today = dayStart(now);
  const add = (d: number, m = 0, y = 0) => new Date(today.getFullYear() + y, today.getMonth() + m, today.getDate() + d);
  if (/^(วันนี้|today|now|ตอนนี้)$/.test(s)) return today;
  if (/^(พรุ่งนี้|tomorrow|tmr)$/.test(s)) return add(1);
  if (/^(มะรืน|มะรืนนี้)$/.test(s)) return add(2);
  if (/^(เมื่อวาน|เมื่อวานนี้|yesterday)$/.test(s)) return add(-1);
  const rel = /^([+-])\s*(\d+)\s*(วัน|d|days?|สัปดาห์|อาทิตย์|w|weeks?|เดือน|m|months?|ปี|y|years?)?$/.exec(s);
  if (rel) {
    const n = +rel[2]! * (rel[1] === "-" ? -1 : 1);
    const u = rel[3] ?? "d";
    if (/^(สัปดาห์|อาทิตย์|w)/.test(u)) return add(n * 7);
    if (/^(เดือน|m)/.test(u)) return add(0, n);
    if (/^(ปี|y)/.test(u)) return add(0, 0, n);
    return add(n);
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return valid(+iso[3]!, +iso[2]! - 1, fixYear(+iso[1]!, now));
  const parts = s.split(/[\s/.\-,]+/).filter(Boolean);
  if (parts.length < 2) {
    const compact = /^(\d{2})(\d{2})(\d{2}|\d{4})?$/.exec(s); // 180435 / 18042535
    if (compact) return valid(+compact[1]!, +compact[2]! - 1, compact[3] ? fixYear(+compact[3], now) : now.getFullYear());
    return null;
  }
  // Month may be a word anywhere after the day ("18 เม.ย. 35", "5 ต.ค."); gather the rest of the tokens.
  let day = NaN, mon = -1, year = NaN;
  const nums: number[] = [];
  const rest = s.replace(/^\s*(\d{1,2})\s*/, (_, d) => ((day = +d), ""));
  const monWord = rest.match(/[ก-๙a-z.]+[ก-๙a-z.\s]*/i)?.[0];
  if (monWord) mon = monthFromWord(monWord);
  for (const p of rest.split(/[\s/.\-,]+/)) if (/^\d+$/.test(p)) nums.push(+p);
  if (Number.isNaN(day)) return null;
  if (mon < 0) {
    if (!nums.length) return null;
    mon = nums.shift()! - 1;
  }
  year = nums.length ? fixYear(nums[0]!, now) : now.getFullYear();
  return valid(day, mon, year);
}

function valid(d: number, m: number, y: number) {
  if (!(m >= 0 && m < 12 && d >= 1 && d <= 31 && y > 1000)) return null;
  const date = new Date(y, m, d);
  return date.getMonth() === m ? date : null;
}

/** Reads a time: "8", "830", "0830", "8.30", "8:30 pm", "20:15", "บ่าย 2", "2 ทุ่ม", "เที่ยง", "ตอนนี้". */
export function parseTimeText(input: string, now = new Date()): string | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  if (/^(ตอนนี้|now)$/.test(s)) return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (/^เที่ยง(คืน)?$/.test(s)) return s === "เที่ยงคืน" ? "00:00" : "12:00";
  let m = /^บ่าย\s*(\d{1,2})(?:[.:](\d{2}))?/.exec(s);
  if (m) return hm(12 + (+m[1]! % 12), +(m[2] ?? 0));
  m = /^(\d{1,2})\s*ทุ่ม(?:\s*(\d{1,2}))?/.exec(s);
  if (m) return hm(18 + +m[1]!, +(m[2] ?? 0));
  m = /^(\d{1,2})\s*โมง(?:เช้า|เย็น)?/.exec(s);
  if (m) return hm(/เย็น/.test(s) && +m[1]! < 12 ? +m[1]! + 12 : +m[1]!, 0);
  m = /^(\d{1,2})(?:[.:\s]?(\d{2}))?\s*(am|pm|น\.?)?$/.exec(s);
  if (m) {
    let h = +m[1]!;
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    return hm(h, +(m[2] ?? 0));
  }
  m = /^(\d)(\d{2})$/.exec(s); // 830
  if (m) return hm(+m[1]!, +m[2]!);
  return null;
}
const hm = (h: number, m: number) => (h >= 0 && h < 24 && m >= 0 && m < 60 ? `${pad(h)}:${pad(m)}` : null);

/* ---------- shared field shell ---------- */
interface FieldShellProps {
  id?: string;
  disabled?: boolean;
  className?: string;
  placeholder: string;
  display?: string;
  icon: React.ReactNode;
  clearable?: boolean;
  onClear: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  trigger: React.RefObject<HTMLButtonElement | null>;
  aria: Record<string, unknown>;
  panelClassName?: string;
  children: React.ReactNode;
  name?: string;
  value?: string;
}

function FieldShell({ id, disabled, className, placeholder, display, icon, clearable, onClear, open, setOpen, trigger, aria, panelClassName, children, name, value }: FieldShellProps) {
  const panel = React.useRef<HTMLDivElement>(null);
  const { mounted, state } = usePresence(open, 220);
  useLayerDismiss(open, trigger, panel, () => setOpen(false));
  useAnchoredPanel(mounted, trigger, panel, { maxHeight: 560, matchWidth: false });
  return (
    <div className="relative w-full min-w-0">
      <button
        ref={trigger}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        {...aria}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          } else if ((e.key === "Backspace" || e.key === "Delete") && clearable && display) {
            e.preventDefault();
            onClear();
          }
        }}
        className={cn(fieldClass, "vec-select h-9 items-center gap-2 text-left tabular-nums", clearable && display ? "pr-8" : "pr-3", open && "border-ring/60 ring-2 ring-ring/25", className)}
      >
        <span className="flex shrink-0 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span key={display ?? ""} className={cn("min-w-0 flex-1 truncate", display ? "ss-value" : "text-muted-foreground")}>{display ?? placeholder}</span>
      </button>
      {clearable && display && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="ล้างค่า"
          onClick={() => {
            onClear();
            trigger.current?.focus();
          }}
          className="ss-clear absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <XIcon className="h-3 w-3" />
        </button>
      )}
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      {mounted &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            data-state={state}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                trigger.current?.focus();
              }
            }}
            className={cn("ss-pop vec-select-panel fixed left-0 top-0 z-[71] overflow-auto rounded-lg border bg-background p-3 text-foreground shadow-lg", panelClassName)}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}

/** The "type it" box at the top of the date/time panels: shows what it understood as you type. */
function SmartEntry({ placeholder, preview, onCommit, autoFocus }: { placeholder: string; preview: (s: string) => string | null; onCommit: (s: string) => boolean; autoFocus?: boolean }) {
  const [text, setText] = React.useState("");
  const read = text.trim() ? preview(text) : null;
  return (
    <div className="mb-3">
      <input
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (onCommit(text)) setText("");
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-md bg-muted/60 px-3 text-sm outline-none transition-[background-color,box-shadow] placeholder:text-muted-foreground focus:bg-background focus:ring-2 focus:ring-ring/30"
      />
      <div className="h-5 px-1 pt-1 text-[11px]">
        {text.trim() &&
          (read ? (
            <span key={read} className="animate-slide-up text-muted-foreground">
              ↵ <b className="font-semibold text-foreground">{read}</b>
            </span>
          ) : (
            <span className="text-destructive">ยังอ่านไม่ออก ลองรูปแบบอื่น</span>
          ))}
      </div>
    </div>
  );
}

/* ---------- DateField ---------- */
export interface DateFieldProps {
  /** "YYYY-MM-DD" (like <input type="date">). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  min?: string;
  max?: string;
  locale?: string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
}

export function DateField({ value, defaultValue, onValueChange, min, max, locale = "th-TH", placeholder = "เลือกวันที่", clearable, disabled, id, name, className, ...aria }: DateFieldProps) {
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const cur = value !== undefined ? value : inner;
  const date = fromISODateString(cur);
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(() => date ?? new Date());
  const trigger = React.useRef<HTMLButtonElement>(null);
  const lo = fromISODateString(min);
  const hi = fromISODateString(max);
  const set = (d: Date | null) => {
    const v = d ? toISODateString(d) : "";
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };
  const within = (d: Date) => (!lo || d >= lo) && (!hi || d <= hi);
  React.useEffect(() => {
    if (open) setMonth(date ?? new Date());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = (d: Date) => d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const today = dayStart(new Date());
  const presets: [string, Date][] = [["วันนี้", today], ["พรุ่งนี้", new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)], ["+7 วัน", new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)]];
  const choose = (d: Date) => {
    set(d);
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <FieldShell
      id={id}
      name={name}
      value={cur}
      disabled={disabled}
      className={className}
      placeholder={placeholder}
      display={date ? fmt(date) : undefined}
      icon={<CalendarIcon />}
      clearable={clearable}
      onClear={() => set(null)}
      open={open}
      setOpen={setOpen}
      trigger={trigger}
      aria={aria}
    >
      <SmartEntry
        autoFocus
        placeholder="พิมพ์ เช่น 18/4/2535, 5 ต.ค., พรุ่งนี้, +7"
        preview={(s) => {
          const d = parseDateText(s);
          return d ? (within(d) ? d.toLocaleDateString(locale, { dateStyle: "full" }) : null) : null;
        }}
        onCommit={(s) => {
          const d = parseDateText(s);
          if (!d || !within(d)) return false;
          choose(d);
          return true;
        }}
      />
      <Calendar
        captionDropdowns
        value={date}
        month={month}
        onMonthChange={setMonth}
        onValueChange={choose}
        locale={locale}
        min={lo}
        max={hi}
        fromYear={lo?.getFullYear()}
        toYear={hi?.getFullYear()}
      />
      <div className="mt-3 flex items-center gap-1.5 border-t pt-3">
        {presets.map(([label, d]) => (
          <button key={label} type="button" disabled={!within(d)} onClick={() => choose(d)} className="rounded-full border px-2.5 py-1 text-xs font-medium transition-[background-color,scale] hover:bg-accent active:scale-95 disabled:opacity-40">
            {label}
          </button>
        ))}
        {cur && (
          <button type="button" onClick={() => { set(null); setOpen(false); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            ล้าง
          </button>
        )}
      </div>
    </FieldShell>
  );
}

/* ---------- DatePicker (Date objects) ---------- */
interface DatePickerProps {
  value: Date | null;
  onValueChange: (d: Date) => void;
  locale?: string;
  placeholder?: string;
  min?: Date;
  max?: Date;
  className?: string;
}

export function DatePicker({ value, onValueChange, locale = "th-TH", placeholder = "เลือกวันที่", min, max, className }: DatePickerProps) {
  return (
    <DateField
      value={value ? toISODateString(value) : ""}
      onValueChange={(v) => {
        const d = fromISODateString(v);
        if (d) onValueChange(d);
      }}
      locale={locale}
      placeholder={placeholder}
      min={min ? toISODateString(min) : undefined}
      max={max ? toISODateString(max) : undefined}
      className={className}
    />
  );
}

/* ---------- TimeField ---------- */
export interface TimeFieldProps {
  /** "HH:mm" (like <input type="time">). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Minute step for the minute column (1–30). Typed times can still be any minute. */
  minuteStep?: number;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
}

export function TimeField({ value, defaultValue, onValueChange, minuteStep = 5, placeholder = "เลือกเวลา", clearable, disabled, id, name, className, ...aria }: TimeFieldProps) {
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const cur = value !== undefined ? value : inner;
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const [h, m] = (/^\d{2}:\d{2}$/.test(cur) ? cur.split(":").map(Number) : [NaN, NaN]) as [number, number];
  const set = (v: string) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };
  const setHM = (hh: number, mm: number) => set(`${pad(hh)}:${pad(mm)}`);
  const minutes = React.useMemo(() => {
    const list = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
    if (!Number.isNaN(m) && !list.includes(m)) list.push(m);
    return list.sort((a, b) => a - b);
  }, [minuteStep, m]);
  const quick = ["09:00", "12:00", "13:00", "17:00", "18:00"];
  return (
    <FieldShell
      id={id}
      name={name}
      value={cur}
      disabled={disabled}
      className={className}
      placeholder={placeholder}
      display={cur ? `${cur} น.` : undefined}
      icon={<Clock3 />}
      clearable={clearable}
      onClear={() => set("")}
      open={open}
      setOpen={setOpen}
      trigger={trigger}
      aria={aria}
      panelClassName="w-[15.5rem]"
    >
      <SmartEntry
        autoFocus
        placeholder="พิมพ์ เช่น 830, 14.15, บ่าย 2"
        preview={(s) => {
          const t = parseTimeText(s);
          return t ? `${t} น.` : null;
        }}
        onCommit={(s) => {
          const t = parseTimeText(s);
          if (!t) return false;
          set(t);
          setOpen(false);
          trigger.current?.focus();
          return true;
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <TimeColumn label="ชั่วโมง" items={Array.from({ length: 24 }, (_, i) => i)} value={h} onPick={(x) => setHM(x, Number.isNaN(m) ? 0 : m)} />
        <TimeColumn label="นาที" items={minutes} value={m} onPick={(x) => setHM(Number.isNaN(h) ? 9 : h, x)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
        {quick.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              set(t);
              setOpen(false);
            }}
            className={cn("rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-[background-color,scale] hover:bg-accent active:scale-95", cur === t && "border-primary bg-primary/10 text-primary")}
          >
            {t}
          </button>
        ))}
      </div>
    </FieldShell>
  );
}

function TimeColumn({ label, items, value, onPick }: { label: string; items: number[]; value: number; onPick: (n: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const first = React.useRef(true);
  React.useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[aria-selected=true]");
    const box = ref.current;
    if (!el || !box) return;
    const top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    box.scrollTo({ top, behavior: first.current ? "instant" : "smooth" });
    first.current = false;
  }, [value]);
  return (
    <div>
      <p className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">{label}</p>
      <div
        ref={ref}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => {
          const i = items.indexOf(value);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = items[(Math.max(i, 0) + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
            onPick(n!);
          }
        }}
        className="relative h-48 snap-y overflow-y-auto overscroll-contain rounded-md border p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {items.map((n) => (
          <button
            key={n}
            type="button"
            role="option"
            aria-selected={n === value}
            tabIndex={-1}
            onClick={() => onPick(n)}
            className={cn(
              "block h-8 w-full snap-center rounded-md text-center text-sm tabular-nums transition-[background-color,color,scale] duration-300 ease-spring-snappy hover:bg-accent active:scale-95",
              n === value && "scale-105 bg-primary font-semibold text-primary-foreground hover:bg-primary"
            )}
          >
            {pad(n)}
          </button>
        ))}
      </div>
    </div>
  );
}
