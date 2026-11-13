"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldClass } from "./field";
import { animateOut, prefersReducedMotion, springEasing } from "./motion";
import { MinusIcon, PlusIcon, StarIcon, XIcon } from "./icons";
import { SmartSelect, type SelectOption } from "./smart-select";
import { EyeToggleIcon, UploadIcon, usePlay } from "./animated-icons";

const focusWithin = "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/* ---------- Input Group ---------- */
interface InputGroupProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const InputGroup = React.forwardRef<HTMLInputElement, InputGroupProps>(({ prefix, suffix, className, ...props }, ref) => (
  <div className={cn(fieldClass, "h-9 items-center gap-2", focusWithin, className)}>
    {prefix && <span className="flex shrink-0 items-center text-sm text-muted-foreground">{prefix}</span>}
    <input ref={ref} autoComplete="off" className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" {...props} />
    {suffix && <span className="flex shrink-0 items-center text-sm text-muted-foreground">{suffix}</span>}
  </div>
));
InputGroup.displayName = "InputGroup";

export function PasswordInput(props: Omit<InputGroupProps, "type" | "suffix">) {
  const [show, setShow] = React.useState(false);
  return (
    <InputGroup
      {...props}
      type={show ? "text" : "password"}
      suffix={
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="transition-[color,transform,translate,scale,rotate] hover:text-foreground active:scale-90">
          <EyeToggleIcon hidden={show} />
        </button>
      }
    />
  );
}

/* ---------- Number Input ---------- */
interface NumberInputProps {
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function NumberInput({ value, onValueChange, min = -Infinity, max = Infinity, step = 1 }: NumberInputProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const btn = "flex h-full w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&>svg]:transition-transform active:[&>svg]:scale-75";
  const inputRef = React.useRef<HTMLInputElement>(null);
  const prev = React.useRef(value);
  React.useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    if (!prefersReducedMotion()) inputRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }], { duration: 350, easing: springEasing("bouncy") });
  }, [value]);
  return (
    <div className={cn("inline-flex h-9 items-stretch overflow-hidden rounded-md border border-input bg-background", focusWithin)}>
      <button type="button" aria-label="Decrease" disabled={value <= min} onClick={() => onValueChange(clamp(value - step))} className={btn}>
        <MinusIcon className="h-3.5 w-3.5" />
      </button>
      <input
        ref={inputRef}
        type="number"
        value={value}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        onChange={(e) => onValueChange(clamp(Number(e.target.value)))}
        className="w-14 border-x border-input bg-transparent text-center text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" aria-label="Increase" disabled={value >= max} onClick={() => onValueChange(clamp(value + step))} className={btn}>
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---------- Input OTP ---------- */
export function InputOTP({ length = 6, onComplete }: { length?: number; onComplete?: (code: string) => void }) {
  const [digits, setDigits] = React.useState<string[]>(() => Array(length).fill(""));
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const update = (next: string[], focus: number) => {
    setDigits(next);
    refs.current[Math.max(0, Math.min(length - 1, focus))]?.focus();
    if (next.every(Boolean)) onComplete?.(next.join(""));
  };
  return (
    <div
      className="flex items-center gap-2"
      onPaste={(e) => {
        const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
        if (!text) return;
        e.preventDefault();
        update(Array.from({ length }, (_, i) => text[i] ?? ""), text.length);
      }}
    >
      {digits.map((d, i) => (
        <React.Fragment key={i}>
          {length > 4 && length % 2 === 0 && i === length / 2 && <span className="text-muted-foreground">–</span>}
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(-1);
              if (!v) return;
              const next = [...digits];
              next[i] = v;
              update(next, i + 1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                e.preventDefault();
                const next = [...digits];
                if (digits[i]) next[i] = "";
                else if (i > 0) next[i - 1] = "";
                update(next, digits[i] ? i : i - 1);
              } else if (e.key === "ArrowLeft") refs.current[i - 1]?.focus();
              else if (e.key === "ArrowRight") refs.current[i + 1]?.focus();
            }}
            data-filled={!!d}
            className={cn(
              "h-10 w-10 rounded-md border border-input bg-background text-center text-base font-medium caret-transparent transition-[border-color,box-shadow] duration-200 data-[filled=true]:animate-pop-sm data-[filled=true]:border-primary/50",
              focusRing
            )}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

/* ---------- Tag Input ---------- */
export function TagInput({ value, onValueChange, placeholder }: { value: string[]; onValueChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  const remove = (t: string) => animateOut(ref.current?.querySelector(`[data-tag="${CSS.escape(t)}"]`), () => onValueChange(value.filter((x) => x !== t)));
  const add = () => {
    const t = draft.trim();
    if (t && !value.includes(t)) onValueChange([...value, t]);
    setDraft("");
  };
  return (
    <div ref={ref} className={cn("flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 transition-shadow duration-200", focusWithin)}>
      {value.map((t) => (
        <span key={t} data-tag={t} className="inline-flex animate-zoom-in items-center gap-1 rounded-md bg-secondary py-0.5 pl-2 pr-1 text-xs font-medium">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => remove(t)} className="rounded-sm text-muted-foreground transition-[color,transform,translate,scale,rotate] hover:rotate-90 hover:text-foreground">
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) remove(value[value.length - 1]!);
        }}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[80px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

/* ---------- File Upload ---------- */
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  onFilesChange?: (files: File[]) => void;
}

export function FileUpload({ accept, multiple = true, label = "Click or drag files here", hint, onFilesChange }: FileUploadProps) {
  const [drag, setDrag] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploads, playUpload] = usePlay();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const set = (next: File[]) => {
    setFiles(next);
    onFilesChange?.(next);
  };
  const add = (list: FileList | null) => {
    if (!list?.length) return;
    playUpload();
    set(multiple ? [...files, ...Array.from(list)] : Array.from(list).slice(0, 1));
  };
  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "group flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-6 py-8 text-center transition-[background-color,border-color,transform,translate,scale,rotate] duration-200 hover:bg-muted/50 active:scale-[0.99]",
          focusRing,
          drag && "scale-[1.01] border-primary bg-muted/50"
        )}
      >
        <span className={cn("mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform duration-300 group-hover:-translate-y-1", drag && "-translate-y-1 scale-110 animate-bounce")}>
          <UploadIcon play={uploads} />
        </span>
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="grid gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}`} className="flex animate-slide-up items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span className="truncate">{f.name}</span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {formatSize(f.size)}
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={(e) => animateOut(e.currentTarget.closest("li"), () => set(files.filter((_, j) => j !== i)))}
                  className="transition-[color,transform,translate,scale,rotate] hover:rotate-90 hover:text-foreground"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Rating ---------- */
export function Rating({ value, onValueChange, max = 5 }: { value: number; onValueChange?: (v: number) => void; max?: number }) {
  const [hover, setHover] = React.useState(0);
  const shown = hover || value;
  return (
    <div role="radiogroup" aria-label="Rating" className="inline-flex" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} of ${max}`}
          disabled={!onValueChange}
          onMouseEnter={() => onValueChange && setHover(n)}
          onClick={() => onValueChange?.(n)}
          className={cn("rounded-sm p-0.5 transition-transform enabled:hover:scale-125 enabled:active:scale-90 disabled:cursor-default", focusRing)}
        >
          <StarIcon
            key={n === value ? `on${value}` : "off"}
            className={cn("h-5 w-5 transition-colors", n <= shown ? "fill-warning text-warning" : "text-muted-foreground/40", n === value && onValueChange && "animate-pop")}
          />
        </button>
      ))}
    </div>
  );
}

/* ---------- Color Swatches ---------- */
export function ColorPicker({ colors, value, onValueChange }: { colors: string[]; value: string; onValueChange: (c: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onValueChange(c)}
          style={{ backgroundColor: c }}
          className={cn("h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-[box-shadow,transform,translate,scale,rotate] duration-200 hover:scale-110 active:scale-95", focusRing, value === c && "scale-110 ring-2 ring-ring")}
        />
      ))}
    </div>
  );
}

/* ---------- Listbox & Combobox (thin wrappers over SmartSelect) ---------- */
export type Option = SelectOption;

interface ChoiceProps {
  options: Option[];
  value?: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  emptyText?: string;
}

/** A dropdown that decides for itself whether it needs a search box (by how many options it has). */
export function Listbox({ options, value, onValueChange, placeholder = "เลือก…", className, emptyText }: ChoiceProps) {
  return <SmartSelect options={options} value={value ?? null} onValueChange={onValueChange} placeholder={placeholder} className={className} emptyText={emptyText} />;
}

/** Always searchable, however short the list. */
export function Combobox({ options, value, onValueChange, placeholder = "ค้นหา…", className, emptyText }: ChoiceProps) {
  return <SmartSelect options={options} value={value ?? null} onValueChange={onValueChange} placeholder={placeholder} className={className} emptyText={emptyText} searchable />;
}
