"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./form";
import { Button } from "./button";
import { Kbd } from "./display";
import { usePresence } from "./overlay";
import { prefersReducedMotion, springEasing } from "./motion";
import { ChevronDownIcon, PlusIcon } from "./icons";
import { TrashIcon, usePlay } from "./animated-icons";
import "./form-layout.css";

/*
 * Form layout: pack a business form into rows and groups instead of one long column.
 *
 *   <FormGrid>                                   ← 12-column grid that measures its own width (container queries)
 *     <FormField label="คำนำหน้า" span={2}>…      ← [2][5][5] on one row when wide,
 *     <FormField label="ชื่อ" span={5}>…            reflows to fewer columns when narrow,
 *     <FormField label="นามสกุล" span={5}>…         and to one per row on a phone.
 *   </FormGrid>
 *
 * Label placement (top · left · floating), density (default · compact) and mode (edit · view) cascade from the
 * nearest <FormLayout> / <FormGrid>, so a whole form switches with one prop.
 */

/* ---------- Context ---------- */
export type LabelPlacement = "top" | "left" | "floating";
export type FormDensity = "default" | "compact";
export type FormMode = "edit" | "view";

interface FormLayoutValue {
  labels: LabelPlacement;
  density: FormDensity;
  mode: FormMode;
  /** Width of the label column when `labels="left"` (any CSS length). */
  labelWidth: string;
  /** Default columns per row for fields without a `span`. */
  cols: GridCols;
}

const FormLayoutContext = React.createContext<FormLayoutValue>({ labels: "top", density: "default", mode: "edit", labelWidth: "9rem", cols: 12 });
export const useFormLayout = () => React.useContext(FormLayoutContext);

type LayoutOverrides = Partial<Omit<FormLayoutValue, "cols">>;

function useMergedLayout(o: LayoutOverrides & { cols?: GridCols }) {
  const p = useFormLayout();
  const labels = o.labels ?? p.labels, density = o.density ?? p.density, mode = o.mode ?? p.mode;
  const labelWidth = o.labelWidth ?? p.labelWidth, cols = o.cols ?? p.cols;
  return React.useMemo(() => ({ labels, density, mode, labelWidth, cols }), [labels, density, mode, labelWidth, cols]);
}

/** Sets label placement / density / mode for every field inside, without rendering anything itself. */
export function FormLayout({ children, ...o }: LayoutOverrides & { children: React.ReactNode }) {
  return <FormLayoutContext.Provider value={useMergedLayout(o)}>{children}</FormLayoutContext.Provider>;
}

/* ---------- Grid ---------- */
export type GridCols = 1 | 2 | 3 | 4 | 6 | 12;
export type Span = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | "full";

// Written out so Tailwind sees every class. Tiers: base (<24rem), @sm (≥24rem), @lg (≥32rem) of the grid's own width.
const SPAN_BASE = ["", "col-span-1", "col-span-2", "col-span-3", "col-span-4", "col-span-5", "col-span-6", "col-span-7", "col-span-8", "col-span-9", "col-span-10", "col-span-11", "col-span-12"];
const SPAN_MD = ["", "@sm:col-span-1", "@sm:col-span-2", "@sm:col-span-3", "@sm:col-span-4", "@sm:col-span-5", "@sm:col-span-6", "@sm:col-span-7", "@sm:col-span-8", "@sm:col-span-9", "@sm:col-span-10", "@sm:col-span-11", "@sm:col-span-12"];
const SPAN_LG = ["", "@lg:col-span-1", "@lg:col-span-2", "@lg:col-span-3", "@lg:col-span-4", "@lg:col-span-5", "@lg:col-span-6", "@lg:col-span-7", "@lg:col-span-8", "@lg:col-span-9", "@lg:col-span-10", "@lg:col-span-11", "@lg:col-span-12"];

const num = (s: Span) => (s === "full" ? 12 : s);

export interface SpanProps {
  /** Columns (of 12) on a wide form. Defaults to 12 / the grid's `cols`. */
  span?: Span;
  /** Columns on a medium-width form (≥ 24rem). Derived from `span` when omitted. */
  md?: Span;
  /** Columns on a phone-width form. Defaults to full width. */
  sm?: Span;
  /** Start a new row on medium and wide forms. */
  newRow?: boolean;
}

function useSpan({ span, md, sm, newRow }: SpanProps) {
  const { cols } = useFormLayout();
  const lg = num(span ?? ((12 / cols) as Span));
  const mid = md !== undefined ? num(md) : lg >= 7 ? 12 : lg >= 3 ? 6 : 4;
  return cn(SPAN_BASE[sm !== undefined ? num(sm) : 12], SPAN_MD[mid], SPAN_LG[lg], newRow && "@sm:col-start-1");
}

interface FormGridProps extends LayoutOverrides, Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  /** Equal columns for fields without a `span`: 2 → halves, 3 → thirds… Fields can still set their own `span`. */
  cols?: GridCols;
  /** `end` lines up controls along their bottom edge — handy for filter bars whose buttons have no label. */
  align?: "start" | "end";
  children: React.ReactNode;
}

/** A 12-column grid that reflows by its own width, so it works the same in a sidebar, a dialog or a full page. */
export function FormGrid({ cols, labels, density, mode, labelWidth, align = "start", className, children, ...props }: FormGridProps) {
  const ctx = useMergedLayout({ cols, labels, density, mode, labelWidth });
  const Tag = ctx.mode === "view" ? "dl" : "div";
  const dense = ctx.density === "compact";
  return (
    <FormLayoutContext.Provider value={ctx}>
      <div className="@container min-w-0">
        <Tag
          className={cn(
            "grid grid-cols-12",
            align === "end" ? "items-end" : "items-start",
            dense ? "fl-dense gap-x-3 gap-y-3" : ctx.labels === "left" || ctx.mode === "view" ? "gap-x-5 gap-y-4" : "gap-x-4 gap-y-5",
            className
          )}
          {...props}
        >
          {children}
        </Tag>
      </div>
    </FormLayoutContext.Provider>
  );
}

/* ---------- Field ---------- */
export interface FormFieldProps extends SpanProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Shows a quiet "(ไม่บังคับ)" after the label. */
  optional?: boolean;
  /** Small action on the label's right, e.g. a "ใช้ที่อยู่เดิม" link. */
  labelAction?: React.ReactNode;
  /** What view mode shows instead of the control. Empty values render as "—". */
  value?: React.ReactNode;
  /** Id of the control. Generated (and passed to a single child) when omitted. */
  htmlFor?: string;
  className?: string;
  children?: React.ReactNode;
}

type ControlProps = { id?: string; placeholder?: string; "aria-describedby"?: string; "aria-invalid"?: boolean; "aria-labelledby"?: string };

/** One labelled control in a FormGrid. Place several on a row with `span`. */
export function FormField({ label, hint, error, required, optional, labelAction, value, htmlFor, span, md, sm, newRow, className, children }: FormFieldProps) {
  const { labels, mode, labelWidth, density } = useFormLayout();
  const spanClass = useSpan({ span, md, sm, newRow });
  const autoId = React.useId();
  const id = htmlFor ?? autoId;
  const msgId = `${id}-msg`;
  const labelId = `${id}-label`;

  const labelText = label && (
    <>
      {label}
      {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
      {optional && <span className="ml-1 font-normal text-muted-foreground">(ไม่บังคับ)</span>}
    </>
  );

  if (mode === "view") {
    const empty = value === undefined || value === null || value === "";
    return (
      <div className={cn("fl-field min-w-0", spanClass, labels === "left" && "@container/f", className)}>
        <div key="view" className={cn("animate-fade-in", labels === "left" && "grid gap-1 @xs/f:grid-cols-[var(--fl-lw)_minmax(0,1fr)] @xs/f:gap-3")} style={{ "--fl-lw": labelWidth } as React.CSSProperties}>
          <dt className="text-xs text-muted-foreground @xs/f:pt-0.5">{label}</dt>
          <dd className={cn("mt-1 text-sm break-words @xs/f:mt-0", empty ? "text-muted-foreground" : "font-medium")}>{empty ? "—" : value}</dd>
        </div>
      </div>
    );
  }

  const message = error ? (
    <p key={String(error)} id={msgId} className="animate-slide-up text-xs text-destructive">{error}</p>
  ) : hint ? (
    <p id={msgId} className="text-xs text-muted-foreground">{hint}</p>
  ) : null;

  // Wire the single child control to its label and message.
  let control = children;
  if (React.isValidElement<ControlProps>(children)) {
    const extra: ControlProps = {};
    if (children.type === FieldRow) extra["aria-labelledby"] = labelId;
    else if (!children.props.id) extra.id = id;
    if (message) extra["aria-describedby"] = msgId;
    if (error) extra["aria-invalid"] = true;
    if (labels === "floating" && children.props.placeholder === undefined) extra.placeholder = " ";
    control = React.cloneElement(children, extra);
  }
  const invalid = error ? "[&_:is(input,select,textarea,.vec-select)]:border-destructive [&_:is(input,select,textarea,.vec-select)]:focus-visible:ring-destructive" : undefined;

  if (labels === "floating" && label) {
    return (
      <div className={cn("fl-field grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-1.5", spanClass, className)}>
        <div className={cn("fl-float", invalid)} data-invalid={error ? "" : undefined}>
          {control}
          <label id={labelId} htmlFor={id} className="fl-float-label text-sm font-medium">{labelText}</label>
        </div>
        {message}
      </div>
    );
  }

  if (labels === "left") {
    const dense = density === "compact";
    return (
      <div className={cn("fl-field @container/f min-w-0", spanClass, className)}>
        <div className="grid gap-1.5 @xs/f:grid-cols-[var(--fl-lw)_minmax(0,1fr)] @xs/f:gap-x-3" style={{ "--fl-lw": labelWidth } as React.CSSProperties}>
          <div className={cn("flex items-center justify-between gap-2", dense ? "@xs/f:min-h-8" : "@xs/f:min-h-9")}>
            {label && <Label id={labelId} htmlFor={id} className="leading-snug text-muted-foreground @xs/f:text-foreground">{labelText}</Label>}
            {labelAction}
          </div>
          <div className={cn("grid min-w-0 gap-1.5", invalid)}>
            {control}
            {message}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("fl-field grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-1.5", spanClass, className)}>
      {(label || labelAction) && (
        <div className="flex min-h-4 items-end justify-between gap-2">
          {label && <Label id={labelId} htmlFor={id} className="leading-snug">{labelText}</Label>}
          {labelAction && <span className="text-xs">{labelAction}</span>}
        </div>
      )}
      <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)]", invalid)}>{control}</div>
      {message}
    </div>
  );
}

/* ---------- Joined controls ---------- */
/**
 * Renders its children as one connected control: shared borders, outer corners rounded, the focused part on top.
 * Children grow equally; give one `data-fl-fixed` plus a width class (e.g. `w-24`) to keep it narrow.
 */
export function FieldRow({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="group" className={cn("fl-join", className)} {...props}>
      {children}
    </div>
  );
}

/** A static segment inside a FieldRow: a unit, a currency sign, "ถึง" between two dates… */
export function FieldAddon({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("fl-addon flex items-center whitespace-nowrap border border-input bg-muted px-3 text-sm text-muted-foreground", className)}>{children}</span>;
}

/* ---------- Divider / actions ---------- */
/** A sub-heading that spans the whole grid, to split one card into named groups. */
export function FormDivider({ title, description, className }: { title?: React.ReactNode; description?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("col-span-12 flex items-center gap-3 pt-2 first:pt-0", className)}>
      {title && (
        <div className="shrink-0">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
          {description && <p className="mt-0.5 text-xs text-muted-foreground/80">{description}</p>}
        </div>
      )}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/** A row of buttons that sits in the grid like a field. Defaults to a full-width, right-aligned row. */
export function FormActions({ align = "end", span = "full", md, sm, newRow, className, children }: SpanProps & { align?: "start" | "end" | "between"; className?: string; children: React.ReactNode }) {
  const spanClass = useSpan({ span, md, sm, newRow });
  return (
    <div className={cn("flex flex-wrap items-center gap-2", align === "end" ? "justify-end" : align === "between" ? "justify-between" : "justify-start", spanClass, className)}>
      {children}
    </div>
  );
}

/* ---------- Section (settings layout) ---------- */
interface FormSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Wrap the fields in a card. */
  card?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * The classic settings layout: title and description on the left, fields on the right; stacked when narrow.
 * Stack several and they're separated by hairlines.
 */
export function FormSection({ title, description, icon, card, className, children }: FormSectionProps) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className={cn("@container border-t py-8 first:border-t-0 first:pt-0 last:pb-0", className)}>
      <div className="grid gap-x-10 gap-y-5 @2xl:grid-cols-[minmax(11rem,1fr)_minmax(0,2.2fr)]">
        <div className="flex gap-3 self-start @2xl:sticky @2xl:top-20">
          {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
          <div className="min-w-0">
            <h3 id={id} className="text-sm font-semibold tracking-tight">{title}</h3>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        <div className={cn("min-w-0", card && "rounded-lg border bg-card p-4 text-card-foreground shadow-xs sm:p-5")}>{children}</div>
      </div>
    </section>
  );
}

/* ---------- Collapse ---------- */
/**
 * Folds its children open / shut on a spring (height via grid rows). Content is clipped only while closed or
 * moving, so focus rings and popovers aren't cut off once it's open; closed content is `inert`.
 */
export function FormCollapse({ open, className, children }: { open: boolean; className?: string; children: React.ReactNode }) {
  const [settled, setSettled] = React.useState(true);
  const [prev, setPrev] = React.useState(open);
  if (prev !== open) {
    setPrev(open);
    setSettled(false);
  }
  return (
    <div
      onTransitionEnd={(e) => e.target === e.currentTarget && e.propertyName === "grid-template-rows" && setSettled(true)}
      className={cn("grid transition-[grid-template-rows,opacity] duration-500 ease-spring-smooth", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0", className)}
    >
      <div inert={!open} className={cn("min-h-0", open && settled ? "overflow-visible" : "overflow-hidden")}>{children}</div>
    </div>
  );
}

/* ---------- Card (fieldset) ---------- */
interface FormCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Buttons / badges on the header's right. */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/** A titled group of fields with optional header actions, footer and spring collapse. */
export function FormCard({ title, description, icon, actions, footer, collapsible, defaultOpen = true, open: openProp, onOpenChange, className, bodyClassName, children }: FormCardProps) {
  const [openState, setOpenState] = React.useState(defaultOpen);
  const open = !collapsible || (openProp ?? openState);
  const toggle = () => {
    setOpenState(!open);
    onOpenChange?.(!open);
  };
  const id = React.useId();

  const heading = (
    <>
      {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span id={id} className="block text-sm font-semibold tracking-tight">{title}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
    </>
  );

  return (
    <section aria-labelledby={id} className={cn("@container rounded-lg border bg-card text-card-foreground shadow-xs", className)}>
      <header className={cn("flex items-center gap-3 px-4 py-3 @lg:px-5", open && "border-b")}>
        {collapsible ? (
          <button type="button" aria-expanded={open} onClick={toggle} className="-my-1 -ml-1 flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {heading}
            <ChevronDownIcon className={cn("text-muted-foreground transition-[rotate,translate,scale] duration-500 ease-spring-bouncy", !open && "-rotate-90")} />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{heading}</div>
        )}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <FormCollapse open={open}>
        <div className={cn("p-4 @lg:p-5", bodyClassName)}>{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-lg border-t bg-muted/40 px-4 py-3 @lg:px-5">{footer}</div>}
      </FormCollapse>
    </section>
  );
}

/* ---------- Dirty tracking + save bar ---------- */
const same = (a: unknown, b: unknown) => Object.is(a, b) || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

/**
 * Keeps a draft of `initial` and knows which keys changed since the last save.
 *   const f = useFormDraft({ name: "", email: "" });
 *   <Input value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
 *   <SaveBar open={f.dirty} onCancel={f.reset} onSave={f.commit} />
 */
export function useFormDraft<T extends Record<string, unknown>>(initial: T) {
  const [saved, setSaved] = React.useState(initial);
  const [values, setValues] = React.useState(initial);
  const set = React.useCallback(<K extends keyof T>(key: K, value: T[K]) => setValues((v) => ({ ...v, [key]: value })), []);
  const changed = (Object.keys(values) as (keyof T)[]).filter((k) => !same(values[k], saved[k]));
  return {
    values,
    set,
    setValues,
    saved,
    changed,
    dirty: changed.length > 0,
    reset: React.useCallback(() => setValues(saved), [saved]),
    commit: React.useCallback(() => setSaved(values), [values]),
  };
}

interface SaveBarProps {
  /** Show the bar — usually `dirty`. */
  open: boolean;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  /** How many fields changed; shown in the message. */
  count?: number;
  message?: React.ReactNode;
  saveLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  className?: string;
}

/**
 * Springs up from the bottom of its form once something changes, and sticks to the viewport bottom while the form
 * is on screen. ⌘S / Ctrl+S saves while it's open.
 */
export function SaveBar({ open, onSave, onCancel, saving, count, message, saveLabel = "บันทึก", cancelLabel = "ยกเลิก", className }: SaveBarProps) {
  const { mounted } = usePresence(open, 200);
  const save = React.useRef(onSave);
  save.current = onSave;
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!mounted) return null;
  return (
    <div className={cn("pointer-events-none sticky bottom-4 z-30 mt-6 flex justify-center", className)}>
      <div
        role="status"
        className={cn(
          "pointer-events-auto flex w-full max-w-xl items-center gap-2 rounded-xl border bg-background/90 p-2 pl-3.5 shadow-lg ring-1 ring-foreground/5 backdrop-blur-md sm:gap-3",
          open ? "fl-bar-in" : "fl-bar-out"
        )}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inset-0 animate-ping rounded-full bg-warning opacity-60" />
          <span className="relative h-2 w-2 rounded-full bg-warning" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm">
          {message ?? (count ? `แก้ไข ${count} รายการ ยังไม่ได้บันทึก` : "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก")}
        </p>
        <Kbd className="hidden sm:inline-flex">⌘S</Kbd>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>{cancelLabel}</Button>
        <Button type="button" size="sm" onClick={onSave} loading={saving}>{saveLabel}</Button>
      </div>
    </div>
  );
}

/* ---------- Repeater ---------- */
export interface RepeaterColumn<T> {
  key: string;
  label: React.ReactNode;
  /** Grid track on wide forms, e.g. "6rem" or "minmax(0,2fr)". Default "minmax(0,1fr)". */
  width?: string;
  align?: "start" | "end";
  /** On a phone the row becomes a card with two cells per line; `full` takes the whole line. */
  full?: boolean;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode;
  /** What view mode shows. Falls back to `render`. */
  view?: (item: T, index: number) => React.ReactNode;
}

interface RepeaterProps<T extends { id: React.Key }> {
  items: T[];
  onItemsChange: (items: T[]) => void;
  columns: RepeaterColumn<T>[];
  /** Makes a blank row for "add". */
  create: () => T;
  addLabel?: React.ReactNode;
  min?: number;
  max?: number;
  numbered?: boolean;
  /** Rendered under the rows, right of the add button (e.g. totals). */
  footer?: React.ReactNode;
  empty?: React.ReactNode;
  className?: string;
}

/** Editable rows (order lines, contacts, …) with add / remove that grow and collapse on a spring. */
export function Repeater<T extends { id: React.Key }>({ items, onItemsChange, columns, create, addLabel = "เพิ่มรายการ", min = 0, max = Infinity, numbered = true, footer, empty, className }: RepeaterProps<T>) {
  const { mode } = useFormLayout();
  const view = mode === "view";
  const tpl = [numbered && "2rem", ...columns.map((c) => c.width ?? "minmax(0,1fr)"), !view && "2.25rem"].filter(Boolean).join(" ");
  const seen = React.useRef(new Set(items.map((i) => i.id)));
  React.useEffect(() => {
    items.forEach((i) => seen.current.add(i.id));
  });
  const latest = React.useRef(items);
  latest.current = items;

  const update = (id: React.Key) => (patch: Partial<T>) => onItemsChange(latest.current.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: React.Key) => onItemsChange(latest.current.filter((i) => i.id !== id));

  return (
    <div className={cn("@container", className)}>
      <div className="overflow-hidden rounded-lg border" style={{ "--fl-tpl": tpl } as React.CSSProperties}>
        <div className="hidden gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground @2xl:grid @2xl:grid-cols-[var(--fl-tpl)]">
          {numbered && <span className="text-center">#</span>}
          {columns.map((c) => (
            <span key={c.key} className={cn(c.align === "end" && "text-right")}>{c.label}</span>
          ))}
          {!view && <span className="sr-only">ลบ</span>}
        </div>
        <div className="divide-y">
          {items.map((item, index) => (
            <RepeaterRow key={item.id} enter={!seen.current.has(item.id)} canRemove={!view && items.length > min} onRemove={() => remove(item.id)}>
              {numbered && (
                <span className="col-span-2 text-xs font-medium text-muted-foreground tabular-nums @2xl:col-span-1 @2xl:text-center">
                  <span className="@2xl:hidden">รายการที่ </span>{index + 1}
                </span>
              )}
              {columns.map((c) => (
                <div key={c.key} className={cn("min-w-0 @2xl:col-span-1", c.full ? "col-span-2" : "col-span-1", c.align === "end" && "@2xl:text-right")}>
                  <span className="mb-1 block text-xs text-muted-foreground @2xl:hidden">{c.label}</span>
                  {view ? <div className="text-sm">{(c.view ?? ((it: T, i: number) => c.render(it, () => {}, i)))(item, index)}</div> : c.render(item, update(item.id), index)}
                </div>
              ))}
            </RepeaterRow>
          ))}
          {items.length === 0 && <div className="px-3 py-8 text-center text-sm text-muted-foreground">{empty ?? "ยังไม่มีรายการ"}</div>}
        </div>
        {(!view || footer) && (
          <div className="flex flex-col gap-3 border-t bg-muted/30 px-3 py-2.5 @lg:flex-row @lg:items-start @lg:justify-between">
            {!view ? (
              <Button type="button" variant="ghost" size="sm" className="self-start text-primary hover:text-primary [&>svg]:transition-[rotate] [&>svg]:duration-500 [&>svg]:ease-spring-bouncy hover:[&>svg]:rotate-90" disabled={items.length >= max} onClick={() => onItemsChange([...latest.current, create()])}>
                <PlusIcon /> {addLabel}
              </Button>
            ) : <span />}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function RepeaterRow({ enter, canRemove, onRemove, children }: { enter: boolean; canRemove: boolean; onRemove: () => void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [n, play] = usePlay();
  const [leaving, setLeaving] = React.useState(false);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!enter || !el) return;
    el.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea,.vec-select")?.focus({ preventScroll: true });
    if (prefersReducedMotion()) return;
    const h = el.offsetHeight;
    el.style.overflow = "hidden";
    const a = el.animate(
      [{ height: "0px", opacity: 0, translate: "0 -8px" }, { height: `${h}px`, opacity: 1, translate: "0 0" }],
      { duration: 560, easing: springEasing("smooth") }
    );
    a.onfinish = a.oncancel = () => (el.style.overflow = "");
  }, []);

  const removeRow = () => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return onRemove();
    play();
    setLeaving(true);
    // Let the lid open and the sheet drop, then fold the row away.
    window.setTimeout(() => {
      el.style.overflow = "hidden";
      el.animate(
        [{ height: `${el.offsetHeight}px`, opacity: 1 }, { height: "0px", opacity: 0 }],
        { duration: 240, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }
      ).finished.then(onRemove, onRemove);
    }, 420);
  };

  return (
    <div ref={ref}>
      <div className={cn("relative grid grid-cols-2 items-center gap-x-3 gap-y-2.5 px-3 py-3 transition-[opacity,background-color] duration-300 @2xl:grid-cols-[var(--fl-tpl)] @2xl:py-2", leaving && "pointer-events-none bg-destructive/5 opacity-60")}>
        {children}
        {canRemove && (
          <button
            type="button"
            aria-label="ลบรายการ"
            onClick={removeRow}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,scale] duration-300 hover:bg-destructive/10 hover:text-destructive active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @2xl:static @2xl:h-9 @2xl:w-9"
          >
            <TrashIcon play={n} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Summary (totals) ---------- */
/** A right-aligned list of totals, e.g. under a Repeater. */
export function FormSummary({ className, children }: { className?: string; children: React.ReactNode }) {
  return <dl className={cn("grid w-full gap-1.5 text-sm @lg:ml-auto @lg:max-w-xs", className)}>{children}</dl>;
}

export function SummaryRow({ label, strong, className, children }: { label: React.ReactNode; strong?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", strong && "mt-1 border-t pt-2.5 text-base font-semibold", className)}>
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}
