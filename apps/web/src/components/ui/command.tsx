"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Backdrop, useOutside, usePresence, useScrollLock } from "./overlay";
import { Kbd } from "./display";
import { SearchIcon } from "./icons";

export interface CommandItem {
  id: string;
  label: string;
  group?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  keywords?: string;
  onSelect?: () => void;
}

/** Runs `handler` on ⌘/Ctrl + key. */
export function useHotkey(key: string, handler: () => void) {
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === key) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [key, handler]);
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: CommandItem[];
  placeholder?: string;
  emptyText?: string;
}

export function CommandPalette({ open, onOpenChange, items, placeholder = "Type a command or search…", emptyText = "No results found." }: CommandPaletteProps) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  useOutside(ref, close, open);
  useScrollLock(open);
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);
  React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const q = query.toLowerCase();
  const filtered = items.filter((i) => `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q));
  const groups = [...new Set(filtered.map((i) => i.group ?? ""))];
  const ordered = groups.flatMap((g) => filtered.filter((i) => (i.group ?? "") === g));

  const { mounted } = usePresence(open, 150);
  if (!mounted) return null;
  const run = (it: CommandItem) => {
    close();
    it.onSelect?.();
  };
  let index = -1;
  return createPortal(
    <div className={cn("fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]", !open && "pointer-events-none")}>
      <Backdrop closing={!open} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={cn("relative w-full max-w-lg overflow-hidden rounded-lg border bg-background shadow-lg", open ? "animate-zoom-in" : "animate-zoom-out")}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="text-muted-foreground" />
          <input
            autoFocus
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              const n = ordered.length;
              if (!n) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(ordered[active]!);
              }
            }}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-1">
          {ordered.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>}
          {groups.map((g) => (
            <div key={g} role="group">
              {g && <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{g}</p>}
              {filtered
                .filter((i) => (i.group ?? "") === g)
                .map((it) => {
                  const idx = ++index;
                  return (
                    <button
                      key={it.id}
                      role="option"
                      aria-selected={idx === active}
                      data-index={idx}
                      onMouseMove={() => setActive(idx)}
                      onClick={() => run(it)}
                      className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors duration-100", idx === active && "bg-accent")}
                    >
                      {it.icon && <span className="text-muted-foreground">{it.icon}</span>}
                      <span className="flex-1">{it.label}</span>
                      {it.shortcut && <span className="text-xs tracking-widest text-muted-foreground">{it.shortcut}</span>}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
