"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import { cn } from "@/lib/utils";
import { createSearcher, highlightParts, swapLayout, type SearchHit } from "@/lib/smart-search";
import { fieldClass } from "./field";
import { usePresence } from "./overlay";
import { useSwipeDismiss } from "./motion";
import { CheckIcon, ChevronDownIcon, PlusIcon, SearchIcon, XIcon } from "./icons";
import "./smart-select.css";

/*
 * The system's own dropdown. Nothing here is drawn by the browser: no <select>, no <datalist>, no native popup.
 *
 * How much UI a list gets depends on how much is in it:
 *  - short lists (< 8 options) open as a plain list; typing letters jumps to a match (Thai too)
 *  - longer lists get a smart search box (see lib/smart-search: any character, any word order, tone-mark and
 *    punctuation insensitive, fuzzy, and it notices text typed on the wrong keyboard layout)
 *  - very long lists (> 120 rows) are virtualised so thousands of options stay smooth
 *  - on phones, long lists open as a bottom sheet (swipe down to close) instead of a tiny popover
 *
 *   <SmartSelect options={provinces} value={v} onValueChange={setV} />
 *   <MultiSelect options={tags} value={tags} onValueChange={setTags} creatable />
 *   <Select value={v} onChange={(e) => setV(e.target.value)}><option value="a">A</option></Select>  // drop-in for <select>
 */

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  /** Options with the same group are listed under one heading. */
  group?: string;
  icon?: React.ReactNode;
  /** Extra words the search should find this option by (English name, abbreviations, codes…). */
  keywords?: string[];
  disabled?: boolean;
}

/** From this many options up, the list gets a search box (when `searchable` is "auto"). */
export const SEARCH_THRESHOLD = 8;
const VIRTUAL_FROM = 120;
const ROW_H = 36;
const ROW_H_DESC = 52;
const HEAD_H = 28;

interface CommonProps {
  options: SelectOption[];
  placeholder?: string;
  /** `"auto"` (default) shows the search box only when the list is long enough to need it. */
  searchable?: boolean | "auto";
  searchPlaceholder?: string;
  emptyText?: string;
  /** Show a ✕ to clear the value. */
  clearable?: boolean;
  /** Offer "เพิ่ม “…”" when the search finds no exact match. Return the new option's value from `onCreate`. */
  creatable?: boolean;
  onCreate?: (label: string) => string | SelectOption | void;
  /** Remember recent picks (per key, in this browser) and show them first. */
  recentKey?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  size?: "sm" | "md";
  className?: string;
  /** Classes for the popup panel. */
  contentClassName?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  onOpenChange?: (open: boolean) => void;
}

export interface SmartSelectProps extends CommonProps {
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string, option: SelectOption) => void;
  onClear?: () => void;
}

export interface MultiSelectProps extends CommonProps {
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (values: string[]) => void;
  /** How many chips the trigger shows before "+N". */
  maxChips?: number;
}

export const SmartSelect = React.forwardRef<HTMLButtonElement, SmartSelectProps>(function SmartSelect(
  { value, defaultValue, onValueChange, onClear, ...rest },
  ref
) {
  const [inner, setInner] = React.useState<string | null>(defaultValue ?? null);
  const current = value !== undefined ? value : inner;
  const selected = React.useMemo(() => (current == null ? [] : [current]), [current]);
  return (
    <SelectCore
      ref={ref}
      {...rest}
      multiple={false}
      selected={selected}
      onPick={(o) => {
        if (value === undefined) setInner(o.value);
        onValueChange?.(o.value, o);
      }}
      onClear={() => {
        if (value === undefined) setInner(null);
        onClear?.();
      }}
    />
  );
});

export const MultiSelect = React.forwardRef<HTMLButtonElement, MultiSelectProps>(function MultiSelect(
  { value, defaultValue, onValueChange, ...rest },
  ref
) {
  const [inner, setInner] = React.useState<string[]>(defaultValue ?? []);
  const current = value ?? inner;
  const set = (v: string[]) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };
  return (
    <SelectCore
      ref={ref}
      {...rest}
      multiple
      selected={current}
      onPick={(o) => set(current.includes(o.value) ? current.filter((v) => v !== o.value) : [...current, o.value])}
      onPickMany={(vals, on) => set(on ? [...new Set([...current, ...vals])] : current.filter((v) => !vals.includes(v)))}
      onClear={() => set([])}
    />
  );
});

/* ---------- drop-in replacement for <select> ---------- */
type NativeLike = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "defaultValue" | "multiple" | "size" | "children">;
export interface SelectProps extends NativeLike, Omit<CommonProps, "options" | keyof NativeLike> {
  value?: string | number;
  defaultValue?: string | number;
  /** Called like a native select's onChange: read `e.target.value`. */
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onValueChange?: (value: string) => void;
  /** `<option>` / `<optgroup>` children, exactly as with a native select. */
  children?: React.ReactNode;
  /** Or pass options directly. */
  options?: SelectOption[];
}

/**
 * Same API as a native `<select>` (children `<option>`/`<optgroup>`, `value`, `onChange(e => e.target.value)`),
 * rendered entirely by the system. A `hidden` option becomes the placeholder.
 */
export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { children, options: given, value, defaultValue, onChange, onValueChange, placeholder, name, className, disabled, id, required, ...rest },
  ref
) {
  const parsed = React.useMemo(() => (given ? { options: given, placeholder: undefined } : parseOptions(children)), [given, children]);
  const options = parsed.options;
  const [inner, setInner] = React.useState<string | undefined>(() =>
    defaultValue !== undefined ? String(defaultValue) : value === undefined && !parsed.placeholder ? options.find((o) => !o.disabled)?.value : undefined
  );
  const current = value !== undefined ? String(value) : inner;
  const pass = pickCommon(rest);
  return (
    <SmartSelect
      ref={ref}
      {...pass}
      id={id}
      name={name}
      required={required}
      disabled={disabled}
      className={className}
      options={options}
      placeholder={placeholder ?? parsed.placeholder}
      value={current ?? null}
      onValueChange={(v) => {
        if (value === undefined) setInner(v);
        onValueChange?.(v);
        if (onChange) {
          const target = { value: v, name: name ?? "", id: id ?? "" };
          onChange({ target, currentTarget: target, type: "change", preventDefault() {}, stopPropagation() {}, persist() {} } as unknown as React.ChangeEvent<HTMLSelectElement>);
        }
      }}
    />
  );
});

const COMMON_KEYS = [
  "searchable", "searchPlaceholder", "emptyText", "clearable", "creatable", "onCreate", "recentKey", "size", "contentClassName",
  "aria-label", "aria-labelledby", "aria-describedby", "aria-invalid", "onOpenChange",
] as const;
function pickCommon(p: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of COMMON_KEYS) if (p[k] !== undefined) out[k] = p[k];
  return out as Partial<CommonProps>;
}

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function parseOptions(children: React.ReactNode) {
  const options: SelectOption[] = [];
  let placeholder: string | undefined;
  const walk = (nodes: React.ReactNode, group?: string) =>
    React.Children.forEach(nodes, (c) => {
      if (!React.isValidElement(c)) return;
      const p = c.props as { value?: unknown; children?: React.ReactNode; disabled?: boolean; hidden?: boolean; label?: string };
      if (c.type === "option") {
        const label = textOf(p.children);
        if (p.hidden) placeholder ??= label;
        else options.push({ value: String(p.value ?? label), label, disabled: p.disabled, group });
      } else if (c.type === "optgroup") walk(p.children, p.label);
      else if (c.type === React.Fragment) walk(p.children, group);
      else if (typeof c.type === "function" && !(c.type.prototype && "render" in c.type.prototype)) {
        // A small helper component that returns <option>s (e.g. <Options items={…} />): read what it returns.
        try {
          walk((c.type as (p: unknown) => React.ReactNode)(c.props), group);
        } catch {
          /* not a plain option helper; ignore */
        }
      }
    });
  walk(children);
  return { options, placeholder };
}

/* ---------- recent picks ---------- */
const readRecent = (key?: string): string[] => {
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(`vec-select-recent:${key}`) ?? "[]");
  } catch {
    return [];
  }
};
const pushRecent = (key: string | undefined, v: string) => {
  if (!key) return;
  try {
    localStorage.setItem(`vec-select-recent:${key}`, JSON.stringify([v, ...readRecent(key).filter((x) => x !== v)].slice(0, 5)));
  } catch {
    /* storage unavailable */
  }
};

/* ---------- shared floating-layer plumbing (also used by DateField / TimeField) ---------- */
const layers: HTMLElement[] = [];

/**
 * Closes a floating panel on a press outside it. Panels stack: a press inside a panel opened later (a dropdown
 * inside this panel, say) doesn't count as outside, so nested dropdowns don't close their parent.
 */
export function useLayerDismiss(
  open: boolean,
  anchor: React.RefObject<HTMLElement | null>,
  panel: React.RefObject<HTMLElement | null>,
  onDismiss: () => void
) {
  const cb = React.useRef(onDismiss);
  cb.current = onDismiss;
  React.useEffect(() => {
    if (!open) return;
    let el: HTMLElement | null = null;
    const raf = requestAnimationFrame(() => {
      el = panel.current;
      if (el) layers.push(el);
    });
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchor.current?.contains(t)) return;
      const me = el ? layers.indexOf(el) : -1;
      const above = me >= 0 ? layers.slice(me) : panel.current ? [panel.current] : [];
      if (above.some((l) => l.contains(t))) return;
      cb.current();
    };
    document.addEventListener("pointerdown", down, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", down, true);
      if (el) layers.splice(layers.indexOf(el), 1);
    };
  }, [open, anchor, panel]);
}

/** Pins a fixed-position panel under (or above, if there's no room) its anchor and keeps it there. */
export function useAnchoredPanel(
  active: boolean,
  anchor: React.RefObject<HTMLElement | null>,
  panel: React.RefObject<HTMLElement | null>,
  { maxHeight = 360, minWidth = 176, matchWidth = true, placement = "bottom-start" as "bottom-start" | "bottom-end" } = {}
) {
  React.useLayoutEffect(() => {
    if (!active || !anchor.current || !panel.current) return;
    const ref = anchor.current;
    const el = panel.current;
    el.style.visibility = "hidden"; // until the first position lands, so it never flashes at 0,0
    return autoUpdate(ref, el, () => {
      computePosition(ref, el, {
        strategy: "fixed",
        placement,
        middleware: [
          offset(6),
          flip({ padding: 8 }),
          shift({ padding: 8 }),
          size({
            padding: 8,
            apply({ availableHeight, rects }) {
              if (matchWidth) el.style.minWidth = `${Math.max(rects.reference.width, minWidth)}px`;
              el.style.maxHeight = `${Math.max(160, Math.min(availableHeight, maxHeight))}px`;
            },
          }),
        ],
      }).then(({ x, y, placement: p }) => {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.dataset.side = p.startsWith("top") ? "top" : "bottom";
        el.style.visibility = "";
      });
    });
  }, [active, anchor, panel, maxHeight, minWidth, matchWidth, placement]);
}

export function useMedia(q: string) {
  const [m, setM] = React.useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

/* ---------- the core ---------- */
type Row =
  | { kind: "head"; key: string; label: string }
  | { kind: "opt"; key: string; hit: SearchHit<SelectOption> }
  | { kind: "create"; key: string; label: string };

interface CoreProps extends CommonProps {
  multiple: boolean;
  selected: string[];
  onPick: (o: SelectOption) => void;
  onPickMany?: (values: string[], on: boolean) => void;
  onClear: () => void;
  maxChips?: number;
}

const SelectCore = React.forwardRef<HTMLButtonElement, CoreProps>(function SelectCore(props, fwdRef) {
  const {
    options, multiple, selected, onPick, onPickMany, onClear, placeholder = "เลือก…", searchable = "auto", searchPlaceholder, emptyText = "ไม่พบรายการ",
    clearable, creatable, onCreate, recentKey, disabled, id, name, required, size: sz = "md", className, contentClassName, maxChips = 3, onOpenChange,
  } = props;
  const [open, setOpenState] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(-1);
  const [extra, setExtra] = React.useState<SelectOption[]>([]); // options created in this session
  const { mounted, state } = usePresence(open, 220);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const list = React.useRef<HTMLDivElement>(null);
  const search = React.useRef<HTMLInputElement>(null);
  const reactId = React.useId();
  const listId = `${reactId}-list`;
  const phone = useMedia("(max-width: 639px)");

  React.useImperativeHandle(fwdRef, () => trigger.current!, []);

  const all = React.useMemo(() => (extra.length ? [...options, ...extra.filter((e) => !options.some((o) => o.value === e.value))] : options), [options, extra]);
  const byValue = React.useMemo(() => new Map(all.map((o) => [o.value, o])), [all]);
  const searchOn = searchable === "auto" ? all.length >= SEARCH_THRESHOLD || !!creatable : searchable;
  const sheet = phone && (searchOn || all.length > 6);
  const searcher = React.useMemo(() => createSearcher(all), [all]);
  const result = React.useMemo(() => searcher(query), [searcher, query]);

  const setOpen = React.useCallback(
    (v: boolean) => {
      setOpenState(v);
      onOpenChange?.(v);
    },
    [onOpenChange]
  );

  /* rows: recent + grouped options when idle, ranked hits when searching */
  const rows = React.useMemo<Row[]>(() => {
    const out: Row[] = [];
    const q = query.trim();
    if (!q) {
      const recent = searchOn ? readRecent(recentKey).map((v) => byValue.get(v)).filter((o): o is SelectOption => !!o && !o.disabled).slice(0, 3) : [];
      if (recent.length) {
        out.push({ kind: "head", key: "h:recent", label: "ใช้ล่าสุด" });
        for (const o of recent) out.push({ kind: "opt", key: `r:${o.value}`, hit: { item: o, score: 0, ranges: [] } });
        if (!all.some((o) => o.group)) out.push({ kind: "head", key: "h:all", label: "ทั้งหมด" });
      }
      let group: string | undefined;
      for (const h of result.hits) {
        if (h.item.group !== group) {
          group = h.item.group;
          if (group) out.push({ kind: "head", key: `h:${group}`, label: group });
        }
        out.push({ kind: "opt", key: h.item.value, hit: h });
      }
    } else {
      for (const h of result.hits) out.push({ kind: "opt", key: h.item.value, hit: h });
      if (creatable && !all.some((o) => o.label.trim().toLowerCase() === q.toLowerCase())) out.push({ kind: "create", key: "create", label: q });
    }
    return out;
  }, [query, result, searchOn, recentKey, byValue, all, creatable]);

  const selectable = (r: Row | undefined) => !!r && (r.kind === "create" || (r.kind === "opt" && !r.hit.item.disabled));
  const firstActive = React.useCallback(
    (rs: Row[]) => {
      const sel = rs.findIndex((r) => r.kind === "opt" && selected.includes(r.hit.item.value) && !r.key.startsWith("r:"));
      return sel >= 0 && !query ? sel : rs.findIndex(selectable);
    },
    [selected, query]
  );

  // Reset the active row whenever the rows change (typing, opening).
  React.useEffect(() => {
    if (open) setActive(firstActive(rows));
  }, [rows, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPanel = (initialQuery = "") => {
    if (disabled) return;
    setQuery(initialQuery);
    setOpen(true);
  };
  const close = React.useCallback(
    (refocus = true) => {
      setOpen(false);
      if (refocus) trigger.current?.focus({ preventScroll: true });
    },
    [setOpen]
  );

  const commit = (r: Row | undefined) => {
    if (!r || r.kind === "head" || !selectable(r)) return;
    if (r.kind === "create") {
      const made = onCreate?.(r.label);
      const opt: SelectOption = typeof made === "object" && made ? made : { value: typeof made === "string" ? made : r.label, label: r.label };
      setExtra((x) => [...x, opt]);
      onPick(opt);
      pushRecent(recentKey, opt.value);
      if (multiple) setQuery("");
      else close();
      return;
    }
    const o = r.hit.item;
    onPick(o);
    if (!multiple || !selected.includes(o.value)) pushRecent(recentKey, o.value);
    if (!multiple) close();
  };

  /* keyboard */
  const typeahead = React.useRef({ buf: "", t: 0 });
  const move = (dir: 1 | -1, from = active) => {
    if (!rows.length) return;
    let i = from;
    for (let n = 0; n < rows.length; n++) {
      i = (i + dir + rows.length) % rows.length;
      if (selectable(rows[i])) return setActive(i);
    }
  };
  const onListKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      move(k === "ArrowDown" ? 1 : -1);
    } else if (k === "Home" || k === "End") {
      if (e.currentTarget === search.current && query) return;
      e.preventDefault();
      move(k === "Home" ? 1 : -1, k === "Home" ? -1 : 0);
    } else if (k === "PageDown" || k === "PageUp") {
      e.preventDefault();
      let i = active;
      for (let n = 0; n < 8; n++) {
        const before = i;
        let j = i;
        do j = j + (k === "PageDown" ? 1 : -1);
        while (j >= 0 && j < rows.length && !selectable(rows[j]));
        if (j < 0 || j >= rows.length) break;
        i = j;
        if (i === before) break;
      }
      setActive(i);
    } else if (k === "Enter") {
      e.preventDefault();
      commit(rows[active]);
    } else if (k === " " && e.currentTarget !== search.current) {
      e.preventDefault();
      commit(rows[active]);
    } else if (k === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (query && searchOn) setQuery("");
      else close();
    } else if (k === "Tab") {
      close(false);
    } else if (multiple && (e.metaKey || e.ctrlKey) && k.toLowerCase() === "a" && e.currentTarget !== search.current) {
      e.preventDefault();
      onPickMany?.(rows.flatMap((r) => (r.kind === "opt" && !r.key.startsWith("r:") && !r.hit.item.disabled ? [r.hit.item.value] : [])), true);
    } else if (!searchOn && k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typeahead for short lists: jump to the first option that starts with what was typed (either layout).
      const ta = typeahead.current;
      ta.buf = e.timeStamp - ta.t > 700 ? k : ta.buf + k;
      ta.t = e.timeStamp;
      const tries = [ta.buf, swapLayout(ta.buf)].filter(Boolean) as string[];
      for (const t of tries) {
        const hit = searcher(t).hits.find((h) => !h.item.disabled);
        if (hit) {
          const i = rows.findIndex((r) => r.kind === "opt" && r.hit.item === hit.item && !r.key.startsWith("r:"));
          if (i >= 0) return setActive(i);
        }
      }
    }
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPanel();
    } else if (searchOn && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      openPanel(e.key); // start searching straight from the closed field
    } else if (!searchOn && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !multiple) {
      // Closed short list: like a native select, typing changes the value directly.
      const t = [e.key, swapLayout(e.key)].filter(Boolean) as string[];
      for (const q of t) {
        const hit = searcher(q).hits.find((h) => !h.item.disabled);
        if (hit) {
          onPick(hit.item);
          return;
        }
      }
    } else if ((e.key === "Backspace" || e.key === "Delete") && clearable && selected.length) {
      e.preventDefault();
      onClear();
    }
  };

  /* focus on open */
  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => (searchOn ? search.current : list.current)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [open, searchOn]);

  useLayerDismiss(open, trigger, panel, () => close(false));
  useAnchoredPanel(mounted && !sheet, trigger, panel, { maxHeight: searchOn ? 420 : 340 });

  const sheetSwipe = useSwipeDismiss(panel, "down", () => close());

  const selectedOpts = selected.map((v) => byValue.get(v)).filter((o): o is SelectOption => !!o);
  const single = !multiple ? selectedOpts[0] : undefined;
  const hasValue = selectedOpts.length > 0;
  const shownCount = rows.filter((r) => r.kind === "opt" && !r.key.startsWith("r:")).length;

  return (
    <div className={cn("relative w-full min-w-0", disabled && "opacity-50")}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
        aria-invalid={props["aria-invalid"]}
        aria-required={required || undefined}
        disabled={disabled}
        data-state={open ? "open" : "closed"}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={onTriggerKey}
        className={cn(
          fieldClass,
          "vec-select items-center gap-2 text-left disabled:cursor-not-allowed",
          sz === "sm" ? "h-8 text-[13px]" : multiple ? "min-h-9 py-1" : "h-9",
          clearable && hasValue ? "pr-14" : "pr-8",
          open && "border-ring/60 ring-2 ring-ring/25",
          className
        )}
      >
        {multiple ? (
          hasValue ? (
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {selectedOpts.slice(0, maxChips).map((o) => (
                <span key={o.value} className="ss-chip inline-flex max-w-[10rem] items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium">
                  {o.icon && <span className="shrink-0 [&>svg]:h-3 [&>svg]:w-3">{o.icon}</span>}
                  <span className="truncate">{o.label}</span>
                </span>
              ))}
              {selectedOpts.length > maxChips && (
                <span key={selectedOpts.length} className="ss-chip rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">+{selectedOpts.length - maxChips}</span>
              )}
            </span>
          ) : (
            <span className="flex-1 truncate text-muted-foreground">{placeholder}</span>
          )
        ) : (
          <span key={single?.value ?? ""} className={cn("flex min-w-0 flex-1 items-center gap-2", single ? "ss-value" : "text-muted-foreground")}>
            {single?.icon && <span className="flex shrink-0 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{single.icon}</span>}
            <span className="truncate">{single?.label ?? placeholder}</span>
          </span>
        )}
        <ChevronDownIcon className={cn("pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-[rotate] duration-300 ease-spring-snappy", open && "rotate-180")} />
      </button>
      {clearable && hasValue && !disabled && (
        <button
          type="button"
          aria-label="ล้างค่า"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
            trigger.current?.focus();
          }}
          className="ss-clear absolute right-7 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,scale] hover:bg-accent hover:text-foreground active:scale-90"
        >
          <XIcon className="h-3 w-3" />
        </button>
      )}
      {name && (multiple ? selected.map((v) => <input key={v} type="hidden" name={name} value={v} />) : <input type="hidden" name={name} value={selected[0] ?? ""} />)}

      {mounted &&
        createPortal(
          <>
            {sheet && <div className={cn("fixed inset-0 z-[70] bg-black/40", state === "open" ? "animate-fade-in" : "animate-fade-out")} aria-hidden />}
            <div
              ref={panel}
              data-state={state}
              onPointerDown={(e) => {
                e.stopPropagation(); // keep parent popovers / panels open
                if (sheet) sheetSwipe.onPointerDown(e);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                "vec-select-panel z-[71] flex flex-col overflow-hidden border bg-background text-foreground shadow-lg",
                sheet ? "ss-sheet fixed inset-x-0 bottom-0 max-h-[82dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]" : "ss-pop fixed left-0 top-0 w-max max-w-[min(28rem,calc(100vw-16px))] rounded-lg",
                contentClassName
              )}
            >
              {sheet && (
                <div className="flex shrink-0 flex-col items-center gap-2 px-4 pb-1 pt-2.5">
                  <span className="h-1 w-10 rounded-full bg-muted-foreground/30" />
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-semibold">{props["aria-label"] ?? placeholder}</span>
                    <button type="button" onClick={() => close()} className="rounded-md px-2 py-1 text-sm font-medium text-primary active:scale-95">
                      {multiple ? "เสร็จ" : "ปิด"}
                    </button>
                  </div>
                </div>
              )}
              {searchOn && (
                <div className={cn("shrink-0 border-b p-1.5", sheet && "px-3 pb-2")}>
                  <div className="flex h-9 items-center gap-2 rounded-md bg-muted/60 px-2.5 transition-[background-color,box-shadow] focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/30">
                    <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      ref={search}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={onListKey}
                      role="searchbox"
                      aria-controls={listId}
                      aria-activedescendant={active >= 0 ? `${reactId}-r${active}` : undefined}
                      aria-label="ค้นหาในรายการ"
                      placeholder={searchPlaceholder ?? `ค้นหาจาก ${all.length.toLocaleString("th-TH")} รายการ…`}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    {query ? (
                      <button type="button" aria-label="ล้างคำค้น" onClick={() => { setQuery(""); search.current?.focus(); }} className="animate-pop rounded-full p-0.5 text-muted-foreground hover:text-foreground">
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  {query && (
                    <div className="flex items-center justify-between gap-2 px-1 pt-1.5 text-[11px] text-muted-foreground">
                      <span key={result.layoutQuery ?? "q"} className={cn(result.layoutQuery && "animate-slide-up")}>
                        {result.layoutQuery ? (
                          <>แป้นพิมพ์ผิดภาษา? แสดงผลของ “<b className="font-semibold text-foreground">{result.layoutQuery}</b>”</>
                        ) : (
                          <>พบ {shownCount.toLocaleString("th-TH")} จาก {all.length.toLocaleString("th-TH")}</>
                        )}
                      </span>
                      {multiple && shownCount > 1 && (
                        <button
                          type="button"
                          onClick={() => onPickMany?.(rows.flatMap((r) => (r.kind === "opt" && !r.hit.item.disabled ? [r.hit.item.value] : [])), true)}
                          className="shrink-0 font-medium text-primary hover:underline"
                        >
                          เลือกทั้งหมดที่พบ
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <OptionRows
                listRef={list}
                listId={listId}
                idBase={reactId}
                rows={rows}
                active={active}
                setActive={setActive}
                selected={selected}
                multiple={multiple}
                onCommit={commit}
                onKeyDown={onListKey}
                focusable={!searchOn}
                emptyText={emptyText}
                query={query}
                sheet={sheet}
                label={props["aria-label"]}
              />
              {multiple && hasValue && (
                <div className="flex shrink-0 items-center justify-between border-t px-3 py-1.5 text-xs text-muted-foreground">
                  <span>เลือกแล้ว {selected.length.toLocaleString("th-TH")}</span>
                  <button type="button" onClick={onClear} className="font-medium hover:text-foreground">ล้างทั้งหมด</button>
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
});

/* ---------- the list (plain or virtualised), with a sliding highlight ---------- */
interface RowsProps {
  listRef: React.RefObject<HTMLDivElement | null>;
  listId: string;
  idBase: string;
  rows: Row[];
  active: number;
  setActive: (i: number) => void;
  selected: string[];
  multiple: boolean;
  onCommit: (r: Row) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  focusable: boolean;
  emptyText: string;
  query: string;
  sheet: boolean;
  label?: string;
}

const rowHeight = (r: Row) => (r.kind === "head" ? HEAD_H : r.kind === "opt" && r.hit.item.description ? ROW_H_DESC : ROW_H);

function OptionRows({ listRef, listId, idBase, rows, active, setActive, selected, multiple, onCommit, onKeyDown, focusable, emptyText, query, sheet, label }: RowsProps) {
  const virtual = rows.length > VIRTUAL_FROM;
  const offsets = React.useMemo(() => {
    const o = [0];
    for (const r of rows) o.push(o[o.length - 1]! + rowHeight(r));
    return o;
  }, [rows]);
  const [scroll, setScroll] = React.useState(0);
  const [viewH, setViewH] = React.useState(360);
  const pill = React.useRef<HTMLDivElement>(null);
  const pointer = React.useRef(false);
  const first = React.useRef(true);

  // The panel's max-height lands a frame after mount, so measure on resize rather than once.
  React.useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setViewH(Math.min(el.clientHeight || 360, window.innerHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [listRef]);

  // Keep the active row in view (keyboard) and slide the highlight pill to it.
  React.useLayoutEffect(() => {
    const el = listRef.current;
    const p = pill.current;
    if (!el || !p) return;
    if (active < 0 || !rows[active]) {
      p.style.opacity = "0";
      return;
    }
    const top = offsets[active]! + 4; // 4 = list padding
    const h = rowHeight(rows[active]);
    if (!pointer.current) {
      if (top < el.scrollTop + 4) el.scrollTop = top - 4 - (rows[active - 1]?.kind === "head" ? HEAD_H : 0);
      else if (top + h > el.scrollTop + el.clientHeight - 4) el.scrollTop = top + h - el.clientHeight + 4;
    }
    p.style.transition = first.current ? "none" : "";
    p.style.opacity = "1";
    p.style.height = `${h}px`;
    p.style.translate = `0 ${top}px`;
    first.current = false;
  }, [active, rows, offsets, listRef]);

  let from = 0;
  let to = rows.length;
  if (virtual) {
    const lo = Math.max(0, scroll - 240);
    const hi = scroll + viewH + 240;
    while (from < rows.length && offsets[from + 1]! < lo) from++;
    to = from;
    while (to < rows.length && offsets[to]! < hi) to++;
  }

  return (
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={label}
      aria-multiselectable={multiple || undefined}
      aria-activedescendant={focusable && active >= 0 ? `${idBase}-r${active}` : undefined}
      tabIndex={focusable ? 0 : -1}
      onKeyDown={focusable ? onKeyDown : undefined}
      onScroll={(e) => virtual && setScroll(e.currentTarget.scrollTop)}
      onPointerMove={() => (pointer.current = true)}
      onPointerLeave={() => (pointer.current = false)}
      onWheel={() => (pointer.current = true)}
      className={cn("relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 outline-none", sheet && "px-2 pb-3")}
    >
      <div className="relative" style={{ height: offsets[offsets.length - 1] }}>
        <div ref={pill} aria-hidden className="ss-pill pointer-events-none absolute inset-x-0 top-0 rounded-md bg-accent opacity-0" />
        {rows.slice(from, to).map((r, k) => {
          const i = from + k;
          const style: React.CSSProperties = { position: "absolute", top: offsets[i], left: 0, right: 0, height: rowHeight(r), ["--i" as string]: Math.min(k, 12) };
          if (r.kind === "head")
            return (
              <div key={r.key} role="presentation" style={style} className="flex items-end px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {r.label}
              </div>
            );
          if (r.kind === "create")
            return (
              <div
                key={r.key}
                id={`${idBase}-r${i}`}
                role="option"
                aria-selected={false}
                style={style}
                onPointerMove={() => active !== i && setActive(i)}
                onClick={() => onCommit(r)}
                className="ss-row relative flex cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-primary"
              >
                <PlusIcon className="h-4 w-4" /> เพิ่ม “<span className="truncate font-medium">{r.label}</span>”
              </div>
            );
          const o = r.hit.item;
          const on = selected.includes(o.value);
          return (
            <div
              key={r.key}
              id={`${idBase}-r${i}`}
              role="option"
              aria-selected={on}
              aria-disabled={o.disabled || undefined}
              style={style}
              onPointerMove={() => !o.disabled && active !== i && setActive(i)}
              onClick={() => onCommit(r)}
              className={cn("ss-row relative flex items-center gap-2.5 rounded-md px-2 text-sm", o.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer")}
            >
              {multiple && (
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-[background-color,border-color,scale] duration-300 ease-spring-bouncy", on ? "scale-100 border-primary bg-primary text-primary-foreground" : "border-input")}>
                  {on && <CheckIcon className="ss-check h-3 w-3" />}
                </span>
              )}
              {o.icon && <span className="flex shrink-0 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{o.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate", on && !multiple && "font-medium")}>
                  {query && r.hit.ranges.length ? highlightParts(o.label, r.hit.ranges).map((p, j) => (p.hit ? <mark key={j} className="ss-mark">{p.text}</mark> : <React.Fragment key={j}>{p.text}</React.Fragment>)) : o.label}
                </span>
                {o.description && <span className="block truncate text-xs text-muted-foreground">{o.description}</span>}
              </span>
              {query && o.group && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{o.group}</span>}
              {!multiple && on && <CheckIcon className="ss-check h-4 w-4 shrink-0 text-primary" />}
            </div>
          );
        })}
      </div>
      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-1 px-3 py-8 text-center text-sm text-muted-foreground">
          <SearchIcon className="ss-empty h-5 w-5" />
          <span>{emptyText}</span>
          {query && <span className="text-xs">ลองพิมพ์สั้นลง หรือใช้คำอื่น</span>}
        </div>
      )}
    </div>
  );
}
