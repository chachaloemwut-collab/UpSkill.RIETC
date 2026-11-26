"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

import { fieldClass as field } from "./field";
import { DateField, TimeField } from "./date";

/**
 * Text input. `type="date"` and `type="time"` render the system's own DateField / TimeField (no native pickers);
 * they still take string values and call `onChange(e)` with `e.target.value`. Browser autofill suggestions are off
 * unless you pass `autoComplete`.
 */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => {
  if (type === "date" || type === "time") return <PickerInput type={type as "date" | "time"} className={className} {...props} />;
  return <input ref={ref} type={type} autoComplete="off" className={cn(field, "h-10 py-1", className)} {...props} />;
});
Input.displayName = "Input";

function PickerInput({ type, value, defaultValue, onChange, min, max, step, placeholder, id, name, disabled, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { type: "date" | "time" }) {
  const aria = {
    "aria-label": rest["aria-label"],
    "aria-labelledby": rest["aria-labelledby"],
    "aria-describedby": rest["aria-describedby"],
    "aria-invalid": rest["aria-invalid"],
  };
  const emit = (v: string) => {
    const target = { value: v, name: name ?? "", id: id ?? "", type };
    onChange?.({ target, currentTarget: target, type: "change", preventDefault() {}, stopPropagation() {}, persist() {} } as unknown as React.ChangeEvent<HTMLInputElement>);
  };
  const common = {
    id,
    name,
    disabled,
    className,
    placeholder,
    value: value === undefined ? undefined : String(value),
    defaultValue: defaultValue === undefined ? undefined : String(defaultValue),
    onValueChange: emit,
    ...aria,
  };
  if (type === "date") return <DateField {...common} min={min === undefined ? undefined : String(min)} max={max === undefined ? undefined : String(max)} />;
  const stepMin = step ? Math.max(1, Math.round(Number(step) / 60)) : undefined;
  return <TimeField {...common} minuteStep={stepMin && stepMin <= 30 ? stepMin : undefined} />;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} autoComplete="off" className={cn(field, "min-h-[80px] py-2", className)} {...props} />
);
Textarea.displayName = "Textarea";

/* Select lives in ./smart-select (the system's own dropdown, no native <select>). */

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium leading-none", className)} {...props} />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  const generatedId = React.useId();
  const control = React.isValidElement<React.AriaAttributes & { id?: string }>(children) && children.type !== React.Fragment ? children : null;
  const id = control?.props.id ?? generatedId;
  const description = error || hint ? id + "-description" : undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={control ? id : undefined}>{label}</Label>
      {control ? React.cloneElement(control, {
        id,
        "aria-invalid": error ? true : control.props["aria-invalid"],
        "aria-describedby": [control.props["aria-describedby"], description].filter(Boolean).join(" ") || undefined,
      }) : children}
      {description && <p id={description} className={error ? "animate-slide-up text-xs text-destructive" : "text-xs text-muted-foreground"}>{error || hint}</p>}
    </div>
  );
}

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", props.disabled && "cursor-not-allowed opacity-50", className)}>
      <span className="relative flex h-4 w-4 items-center justify-center">
        <input type="checkbox" className="peer h-4 w-4 cursor-[inherit] appearance-none rounded-[4px] border border-primary/60 transition-[background-color,border-color,transform,translate,scale,rotate] active:scale-90 checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" {...props} />
        <svg className="pointer-events-none absolute h-3 w-3 scale-50 text-primary-foreground opacity-0 transition-[opacity,transform,translate,scale,rotate] duration-500 ease-spring-bouncy peer-checked:scale-100 peer-checked:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      {label}
    </label>
  );
}

export function Radio({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", props.disabled && "cursor-not-allowed opacity-50", className)}>
      <input type="radio" className="h-4 w-4 cursor-[inherit] appearance-none rounded-full border border-primary/60 transition-all duration-200 active:scale-90 checked:border-[5px] checked:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" {...props} />
      {label}
    </label>
  );
}

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, label, disabled }: SwitchProps) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", disabled && "cursor-not-allowed opacity-50")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "group relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          checked ? "bg-primary" : "bg-input"
        )}
      >
        <span
          className={cn(
            "block h-4 w-4 rounded-full bg-background shadow-sm transition-all duration-[450ms] ease-spring-snappy group-active:w-5",
            checked ? "translate-x-[18px] group-active:translate-x-[14px]" : "translate-x-0.5"
          )}
        />
      </button>
      {label}
    </label>
  );
}

interface SliderProps {
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

export function Slider({ value, onValueChange, min = 0, max = 100, step = 1, className }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onValueChange(Number(e.target.value))}
      style={{ background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--secondary)) ${pct}%)` }}
      className={cn(
        "h-1.5 w-full cursor-pointer appearance-none rounded-full focus-visible:outline-none",
        "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-125",
        "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:transition-transform hover:[&::-moz-range-thumb]:scale-110 active:[&::-moz-range-thumb]:scale-125",
        "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring",
        className
      )}
    />
  );
}
export { field as fieldClass };
