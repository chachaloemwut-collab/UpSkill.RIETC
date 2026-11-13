"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { XIcon } from "./icons";

export type Trigger = React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;

/** Calls `onOutside` on a mousedown outside `ref` or on Escape. */
export function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean, closeOnClick = true) {
  React.useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => closeOnClick && ref.current && !ref.current.contains(e.target as Node) && onOutside();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onOutside();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [ref, onOutside, active, closeOnClick]);
}

export function useScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

/**
 * Keeps an overlay mounted for `ms` after `open` turns false so it can play an exit animation.
 * Render while `mounted`, and style the closing frame with `data-state="closed"`.
 */
export function usePresence(open: boolean, ms = 200) {
  const [mounted, setMounted] = React.useState(open);
  React.useEffect(() => {
    if (open) return setMounted(true);
    const t = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(t);
  }, [open, ms]);
  return { mounted: open || mounted, state: open ? "open" : "closed" } as const;
}

export function Backdrop({ closing }: { closing?: boolean }) {
  return <div className={cn("fixed inset-0 bg-black/50 backdrop-blur-[2px]", closing ? "animate-fade-out" : "animate-fade-in")} />;
}

/* ---------- Dialog ---------- */
interface DialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** When false, clicking outside does not close and the close button is hidden (for alert dialogs). */
  dismissible?: boolean;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, children, footer, dismissible = true, className }: DialogProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  useOutside(ref, close, open, dismissible);
  useScrollLock(open);
  React.useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>("input,textarea,select,button:not([data-close])")?.focus();
  }, [open]);
  const { mounted, state } = usePresence(open);
  if (!mounted) return null;
  return createPortal(
    <div data-state={state} className="fixed inset-0 z-50 flex items-center justify-center p-4 data-[state=closed]:pointer-events-none">
      <Backdrop closing={!open} />
      <div
        ref={ref}
        role={dismissible ? "dialog" : "alertdialog"}
        aria-modal="true"
        aria-label={title}
        className={cn("relative w-full max-w-md rounded-lg border bg-background p-6 shadow-lg", open ? "animate-zoom-in" : "animate-zoom-out", className)}
      >
        {dismissible && (
          <button data-close onClick={close} aria-label="Close" className="absolute right-4 top-4 rounded-sm text-muted-foreground transition-[color,transform,translate,scale,rotate] duration-200 hover:rotate-90 hover:text-foreground">
            <XIcon />
          </button>
        )}
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ---------- Tooltip ---------- */
export function Tooltip({ content, children, side = "top" }: { content: string; children: React.ReactNode; side?: "top" | "bottom" }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 scale-95 whitespace-nowrap rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground opacity-0 transition-[opacity,translate,scale] duration-150 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-hover:delay-150",
          side === "top" ? "bottom-full mb-2 origin-bottom translate-y-1" : "top-full mt-2 origin-top -translate-y-1"
        )}
      >
        {content}
      </span>
    </span>
  );
}

/* ---------- Menu ---------- */
export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  separator?: boolean;
}

/** The menu surface shared by DropdownMenu, ContextMenu and Menubar. Arrow keys move focus. */
export function MenuList({ items, onClose, className, autoFocus = true, closing }: { items: MenuItem[]; onClose: () => void; className?: string; autoFocus?: boolean; closing?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (autoFocus) ref.current?.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus();
  }, [autoFocus]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)") ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
  };
  return (
    <div
      ref={ref}
      role="menu"
      onKeyDown={onKeyDown}
      className={cn("min-w-[12rem] origin-top rounded-md border bg-background p-1 shadow-md", closing ? "pointer-events-none animate-zoom-out" : "animate-zoom-in", className)}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="-mx-1 my-1 h-px bg-border" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              it.onSelect?.();
              onClose();
            }}
            className={cn(
              "group/item flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-100 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
              it.destructive && "text-destructive"
            )}
          >
            {it.icon && <span className="text-muted-foreground transition-transform group-hover/item:scale-110">{it.icon}</span>}
            <span className="flex-1 transition-transform duration-150 group-hover/item:translate-x-0.5">{it.label}</span>
            {it.shortcut && <span className="ml-4 text-xs tracking-widest text-muted-foreground">{it.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
}

export function DropdownMenu({ trigger, items, align = "start" }: { trigger: Trigger; items: MenuItem[]; align?: "start" | "end" }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useOutside(ref, close, open);
  const { mounted } = usePresence(open, 150);
  return (
    <div ref={ref} className="relative inline-block">
      {React.cloneElement(trigger, { onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu" })}
      {mounted && <MenuList items={items} onClose={close} closing={!open} className={cn("absolute z-50 mt-1.5", align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left")} />}
    </div>
  );
}

/* ---------- Popover ---------- */
export function Popover({ trigger, children, className }: { trigger: Trigger; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useOutside(ref, close, open);
  const { mounted } = usePresence(open, 150);
  return (
    <div ref={ref} className="relative inline-block">
      {React.cloneElement(trigger, { onClick: () => setOpen((o) => !o), "aria-expanded": open })}
      {mounted && (
        <div className={cn("absolute left-0 z-50 mt-1.5 w-72 origin-top-left rounded-md border bg-background p-4 shadow-md", open ? "animate-zoom-in" : "pointer-events-none animate-zoom-out", className)}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ---------- Hover Card ---------- */
export function HoverCard({ trigger, children, openDelay = 300 }: { trigger: React.ReactNode; children: React.ReactNode; openDelay?: number }) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), openDelay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 150);
  };
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const { mounted } = usePresence(open, 150);
  return (
    <span className="relative inline-block" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {trigger}
      {mounted && (
        <div className={cn("absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-md border bg-background p-4 shadow-md", open ? "animate-slide-up" : "animate-slide-down")}>
          {children}
        </div>
      )}
    </span>
  );
}
