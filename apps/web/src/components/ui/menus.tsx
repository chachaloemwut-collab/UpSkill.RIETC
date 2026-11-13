"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { MenuList, useOutside, usePresence, type MenuItem } from "./overlay";
import { ChevronDownIcon } from "./icons";

/* ---------- Context Menu ---------- */
export function ContextMenu({ items, children, className }: { items: MenuItem[]; children: React.ReactNode; className?: string }) {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setPos(null), []);
  useOutside(ref, close, !!pos);
  React.useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", close, { once: true });
    return () => window.removeEventListener("scroll", close);
  }, [pos, close]);
  // Remember where the menu was so it can animate out after `pos` is cleared.
  const last = React.useRef(pos);
  if (pos) last.current = pos;
  const { mounted } = usePresence(!!pos, 150);
  return (
    <div
      className={className}
      onContextMenu={(e) => {
        e.preventDefault();
        setPos({ x: Math.min(e.clientX, window.innerWidth - 208), y: Math.min(e.clientY, window.innerHeight - 40 * items.length) });
      }}
    >
      {children}
      {mounted &&
        last.current &&
        createPortal(
          <div ref={ref} className="fixed z-50" style={{ left: last.current.x, top: last.current.y }}>
            <MenuList items={items} onClose={close} closing={!pos} className="origin-top-left" />
          </div>,
          document.body
        )}
    </div>
  );
}

/* ---------- Menubar ---------- */
export function Menubar({ menus }: { menus: { label: string; items: MenuItem[] }[] }) {
  const [open, setOpen] = React.useState<number | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(null), []);
  useOutside(ref, close, open !== null);
  return (
    <div ref={ref} role="menubar" className="inline-flex h-9 items-center gap-0.5 rounded-md border bg-background p-1">
      {menus.map((m, i) => (
        <div key={m.label} className="relative">
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
            className={cn("rounded-sm px-3 py-1 text-sm font-medium transition-[background-color,transform,translate,scale,rotate] active:scale-95 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none", open === i && "bg-accent")}
          >
            {m.label}
          </button>
          {open === i && <MenuList items={m.items} onClose={close} autoFocus={false} className="absolute left-0 top-full z-50 mt-2" />}
        </div>
      ))}
    </div>
  );
}

/* ---------- Navigation Menu ---------- */
export interface NavLink {
  title: string;
  description?: string;
  href?: string;
}

export function NavigationMenu({ items }: { items: { label: string; href?: string; links?: NavLink[] }[] }) {
  const [open, setOpen] = React.useState<number | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const enter = (i: number) => {
    window.clearTimeout(timer.current);
    setOpen(i);
  };
  const leave = () => {
    timer.current = window.setTimeout(() => setOpen(null), 120);
  };
  const last = React.useRef(open);
  if (open !== null) last.current = open;
  const { mounted } = usePresence(open !== null, 150);
  const shown = last.current;
  const link = "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";
  return (
    <nav className="relative" onMouseLeave={leave} onKeyDown={(e) => e.key === "Escape" && setOpen(null)}>
      <ul className="flex items-center gap-1">
        {items.map((it, i) => (
          <li key={it.label} onMouseEnter={() => (it.links ? enter(i) : setOpen(null))}>
            {it.links ? (
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className={cn(link, "inline-flex items-center gap-1", open === i && "bg-accent")}>
                {it.label}
                <ChevronDownIcon className={cn("h-3 w-3 transition-transform", open === i && "rotate-180")} />
              </button>
            ) : (
              <a href={it.href ?? "#"} onClick={(e) => !it.href && e.preventDefault()} className={link}>
                {it.label}
              </a>
            )}
          </li>
        ))}
      </ul>
      {mounted && shown !== null && items[shown]!.links && (
        <div
          onMouseEnter={() => enter(shown)}
          className={cn(
            "absolute left-0 top-full z-50 mt-1.5 w-[min(32rem,calc(100vw-2rem))] origin-top-left rounded-md border bg-background p-2 shadow-md",
            open === null ? "pointer-events-none animate-zoom-out" : "animate-zoom-in"
          )}
        >
          <ul key={shown} className="grid animate-fade-in gap-1 sm:grid-cols-2">
            {items[shown]!.links!.map((l) => (
              <li key={l.title}>
                <a href={l.href ?? "#"} onClick={(e) => !l.href && e.preventDefault()} className="block rounded-md p-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                  <span className="block text-sm font-medium">{l.title}</span>
                  {l.description && <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{l.description}</span>}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
