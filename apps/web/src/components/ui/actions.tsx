"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Indicator, useIndicator } from "./motion";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const joined = "[&>*]:relative [&>*]:rounded-none [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md [&>*:not(:first-child)]:-ml-px [&>*:focus-visible]:z-10";

export function ButtonGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div role="group" className={cn("inline-flex", joined, className)}>{children}</div>;
}

interface ToggleProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  pressed: boolean;
  onPressedChange: (v: boolean) => void;
  variant?: "default" | "outline";
}

export function Toggle({ pressed, onPressedChange, variant = "default", className, ...props }: ToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center gap-2 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-[color,background-color,transform,translate,scale,rotate] active:scale-95 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        focusRing,
        variant === "outline" && "border bg-background",
        pressed && "bg-accent text-accent-foreground",
        className
      )}
      {...props}
    />
  );
}

interface ToggleGroupProps {
  type?: "single" | "multiple";
  value: string[];
  onValueChange: (v: string[]) => void;
  items: { value: string; label: React.ReactNode; ariaLabel?: string }[];
  variant?: "default" | "outline";
}

export function ToggleGroup({ type = "single", value, onValueChange, items, variant = "default" }: ToggleGroupProps) {
  const toggle = (v: string) => {
    if (type === "single") onValueChange(value.includes(v) ? [] : [v]);
    else onValueChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div role="group" className={cn("inline-flex items-center", variant === "outline" ? joined : "gap-1")}>
      {items.map((it) => (
        <Toggle key={it.value} variant={variant} aria-label={it.ariaLabel} pressed={value.includes(it.value)} onPressedChange={() => toggle(it.value)}>
          {it.label}
        </Toggle>
      ))}
    </div>
  );
}

export function SegmentedControl({ options, value, onValueChange }: { options: { value: string; label: React.ReactNode }[]; value: string; onValueChange: (v: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const rect = useIndicator(ref, "[aria-checked=true]", value);
  return (
    <div ref={ref} role="radiogroup" className="relative inline-flex h-9 items-center rounded-lg bg-muted p-1">
      <Indicator rect={rect} className="bg-background shadow-xs" />
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onValueChange(o.value)}
          className={cn(
            "relative z-10 inline-flex h-7 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-[color,transform,translate,scale,rotate] hover:text-foreground active:scale-95",
            focusRing,
            o.value === value && "text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
