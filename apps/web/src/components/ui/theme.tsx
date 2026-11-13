"use client";
import * as React from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { SegmentedControl } from "./actions";
import { CheckIcon, MoonIcon, PaletteIcon, SunIcon } from "./icons";
import { prefersReducedMotion, springEasing } from "./motion";
import { Popover } from "./overlay";
import { ThemeIcon } from "./animated-icons";

export const THEME_COLORS = [
  { id: "zinc", label: "Zinc", hsl: "240 6% 10%" },
  { id: "blue", label: "Blue", hsl: "221 83% 53%" },
  { id: "violet", label: "Violet", hsl: "262 83% 58%" },
  { id: "green", label: "Green", hsl: "142 71% 34%" },
  { id: "orange", label: "Orange", hsl: "24 95% 50%" },
  { id: "rose", label: "Rose", hsl: "346 77% 50%" },
] as const;
export const THEME_RADII = [0, 0.3, 0.5, 0.625, 1];

export type ThemeColor = (typeof THEME_COLORS)[number]["id"];
export interface ThemeSettings {
  dark: boolean;
  color: ThemeColor;
  radius: number;
}
type Point = { clientX: number; clientY: number };

const KEY = "vec-ui-theme";
export const DEFAULT_THEME: ThemeSettings = { dark: false, color: "zinc", radius: 0.625 };

/**
 * Inline <head> script (rendered with the CSP nonce) that applies the saved theme before first paint, so there is
 * no light-to-dark flash. Kept in sync with `apply()` below.
 */
export const THEME_INIT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("${KEY}")||"{}");var d=typeof s.dark==="boolean"?s.dark:matchMedia("(prefers-color-scheme: dark)").matches;var r=document.documentElement;r.classList.toggle("dark",d);r.dataset.theme=typeof s.color==="string"?s.color:"zinc";if(typeof s.radius==="number")r.style.setProperty("--radius",s.radius+"rem")}catch(e){}`;

function load(): ThemeSettings {
  const fallback: ThemeSettings = { ...DEFAULT_THEME, dark: window.matchMedia("(prefers-color-scheme: dark)").matches };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<ThemeSettings>;
    return {
      dark: typeof saved.dark === "boolean" ? saved.dark : fallback.dark,
      color: THEME_COLORS.some((c) => c.id === saved.color) ? (saved.color as ThemeColor) : fallback.color,
      radius: typeof saved.radius === "number" && THEME_RADII.includes(saved.radius) ? saved.radius : fallback.radius,
    };
  } catch {
    return fallback;
  }
}

function apply(s: ThemeSettings) {
  const root = document.documentElement;
  root.classList.toggle("dark", s.dark);
  root.dataset.theme = s.color;
  root.style.setProperty("--radius", `${s.radius}rem`);
}

// Tiny external store: the server (and hydration) render DEFAULT_THEME, the client then switches to the saved
// settings without a hydration mismatch. The <head> script has already painted the right colors.
let clientSettings: ThemeSettings | null = null;
const listeners = new Set<() => void>();
const themeStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get(): ThemeSettings {
    clientSettings ??= load();
    return clientSettings;
  },
  set(next: ThemeSettings) {
    clientSettings = next;
    listeners.forEach((l) => l());
  },
};

/** Runs `update` as a circular reveal expanding from `from` (or the screen center) where View Transitions are supported. */
export function withReveal(update: () => void, from?: Point) {
  if (!document.startViewTransition || prefersReducedMotion()) return update();
  const x = from?.clientX ?? window.innerWidth / 2;
  const y = from?.clientY ?? window.innerHeight / 2;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  document.startViewTransition(update).ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 650, easing: springEasing("smooth"), pseudoElement: "::view-transition-new(root)" }
    );
  });
}

interface ThemeCtx {
  settings: ThemeSettings;
  setDark: (dark: boolean, from?: Point) => void;
  setColor: (color: ThemeColor, from?: Point) => void;
  setRadius: (radius: number) => void;
}
const Ctx = React.createContext<ThemeCtx | null>(null);

export function useThemeSettings() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useThemeSettings must be used inside <ThemeProvider>");
  return ctx;
}

/** Holds light/dark mode, color theme and radius; applies them to <html> and remembers them in localStorage. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const settings = React.useSyncExternalStore(themeStore.subscribe, themeStore.get, () => DEFAULT_THEME);

  const value = React.useMemo<ThemeCtx>(() => {
    const commit = (patch: Partial<ThemeSettings>) => {
      const next = { ...themeStore.get(), ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable: the theme still applies for this visit */
      }
      flushSync(() => themeStore.set(next));
      apply(next);
    };
    return {
      settings,
      setDark: (dark, from) => withReveal(() => commit({ dark }), from),
      setColor: (color, from) => withReveal(() => commit({ color }), from),
      setRadius: (radius) => commit({ radius }),
    };
  }, [settings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Controls for mode, color and radius. Use inside a popover, a settings page or a sheet. */
export function ThemePanel({ className }: { className?: string }) {
  const { settings, setDark, setColor, setRadius } = useThemeSettings();
  return (
    <div className={cn("grid gap-5", className)}>
      <div className="grid gap-2">
        <p className="text-xs font-medium text-muted-foreground">โหมด</p>
        <div className="grid grid-cols-2 gap-2">
          {[false, true].map((dark) => (
            <Button key={String(dark)} variant="outline" size="sm" onClick={(e) => setDark(dark, e)} className={cn(settings.dark === dark && "border-primary ring-1 ring-primary")}>
              {dark ? <MoonIcon /> : <SunIcon />} {dark ? "มืด" : "สว่าง"}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <p className="text-xs font-medium text-muted-foreground">สีหลัก</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_COLORS.map((c) => {
            const active = settings.color === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={(e) => setColor(c.id, e)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md border px-2 text-xs font-medium transition-[border-color,background-color,scale] hover:bg-accent active:scale-95",
                  active && "border-primary ring-1 ring-primary"
                )}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: `hsl(${c.hsl})` }}>
                  {active && <CheckIcon className="h-2.5 w-2.5 animate-zoom-in" />}
                </span>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-2">
        <p className="text-xs font-medium text-muted-foreground">ความโค้งมน</p>
        <SegmentedControl
          value={String(settings.radius)}
          onValueChange={(v) => setRadius(Number(v))}
          options={THEME_RADII.map((r) => ({ value: String(r), label: r === 0 ? "0" : r }))}
        />
      </div>
    </div>
  );
}

/** A palette button that opens `ThemePanel` in a popover. */
export function ThemeCustomizer() {
  return (
    <Popover
      trigger={<Button variant="ghost" size="icon" aria-label="ปรับแต่งธีม"><PaletteIcon /></Button>}
      className="left-auto right-0 w-80 origin-top-right"
    >
      <p className="mb-4 text-sm font-semibold">ปรับแต่งธีม</p>
      <ThemePanel />
    </Popover>
  );
}

/** Light/dark toggle with the circular reveal. */
export function ThemeToggle() {
  const { settings, setDark } = useThemeSettings();
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={(e) => setDark(!settings.dark, e)}>
      <ThemeIcon dark={settings.dark} />
    </Button>
  );
}
