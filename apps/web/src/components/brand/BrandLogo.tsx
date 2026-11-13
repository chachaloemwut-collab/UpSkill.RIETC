"use client";
/**
 * UpskillReskill.RIETC logo.
 *
 *   URSkill  ──unfold──▶  U·pskill R·e·Skill .RIETC   (the S stays a capital)
 *
 * The acronym letters (U, R) carry the theme's primary color; the folded-in letters slide open with the spring
 * easing from the design system, and the campus suffix fades in last.
 * Everything is CSS transitions driven by one `open` flag, so prefers-reduced-motion (globals.css) makes it instant.
 */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const BRAND_NAME = "UpskillReskill.RIETC";

type Tone = "default" | "inverted";
type Size = "sm" | "lg";

const SIZES: Record<Size, { word: string; suffix: string; mark: string; markText: string; gap: string }> = {
  sm: { word: "text-[15px]", suffix: "text-[11px]", mark: "h-8 w-8 rounded-lg", markText: "text-[13px]", gap: "gap-2.5" },
  lg: { word: "text-3xl sm:text-4xl", suffix: "text-base sm:text-lg", mark: "h-12 w-12 rounded-xl", markText: "text-lg", gap: "gap-4" },
};

const TONES: Record<Tone, { acronym: string; folded: string; base: string; suffix: string; bar: string }> = {
  default: {
    // Gradient keeps U/R distinct even in the zinc theme, where primary equals the text color
    acronym: "bg-gradient-to-br from-primary via-primary to-primary/55 bg-clip-text text-transparent",
    folded: "text-foreground/65",
    base: "text-foreground",
    suffix: "text-muted-foreground",
    bar: "from-primary via-primary/60 to-transparent",
  },
  inverted: {
    acronym: "text-primary-foreground",
    folded: "text-primary-foreground/65",
    base: "text-primary-foreground",
    suffix: "text-primary-foreground/50",
    bar: "from-primary-foreground via-primary-foreground/50 to-transparent",
  },
};

/** One folded run of letters: animates its width between 0 and its natural size. */
function Fold({ open, delay, className, children }: { open: boolean; delay: number; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-grid align-baseline transition-[grid-template-columns,opacity,filter,translate] duration-700 ease-spring-snappy",
        open ? "grid-cols-[1fr] opacity-100 blur-[0px]" : "-translate-x-1 grid-cols-[0fr] opacity-0 blur-[3px]",
        className,
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <span className="overflow-hidden whitespace-nowrap">{children}</span>
    </span>
  );
}

/** Square monogram; tilts, nudges its arrow and catches a light sweep on hover. */
export function BrandMark({ tone = "default", size = "sm", className }: { tone?: Tone; size?: Size; className?: string }) {
  const s = SIZES[size];
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden font-bold shadow-sm transition-transform duration-500 ease-spring-bouncy group-hover/logo:-rotate-6 group-hover/logo:scale-105",
        tone === "inverted" ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
        s.mark,
        className,
      )}
    >
      <span className={cn("relative tracking-tighter", s.markText)}>
        U
        <span className="inline-block transition-transform duration-500 ease-spring-bouncy group-hover/logo:-translate-y-[2px]">R</span>
      </span>
      {/* "up" tick in the corner */}
      <svg viewBox="0 0 10 10" className="absolute right-[14%] top-[14%] h-[26%] w-[26%] opacity-70 transition-[translate,opacity] duration-500 ease-spring-bouncy group-hover/logo:-translate-y-px group-hover/logo:translate-x-px group-hover/logo:opacity-100">
        <path d="M2 8 8 2M3.5 2H8v4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* light sweep */}
      <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover/logo:translate-x-full" />
    </span>
  );
}

/** The wordmark alone. `open` = full name; closed = URSkill. */
export function BrandWordmark({ open, tone = "default", size = "sm", showSuffix = true }: { open: boolean; tone?: Tone; size?: Size; showSuffix?: boolean }) {
  const s = SIZES[size];
  const t = TONES[tone];
  // Opening runs left to right; closing runs right to left
  const d = (i: number) => (open ? i * 110 : (3 - i) * 70);
  return (
    <span aria-hidden className={cn("relative inline-flex items-baseline whitespace-nowrap font-semibold leading-none tracking-tight", s.word)}>
      <span className={cn("font-extrabold transition-transform duration-500 ease-spring-bouncy group-hover/logo:-translate-y-0.5", t.acronym)}>U</span>
      <Fold open={open} delay={d(0)} className={cn("font-medium", t.folded)}>
        pskill
      </Fold>
      <span
        className={cn("font-extrabold transition-transform duration-500 ease-spring-bouncy [transition-delay:60ms] group-hover/logo:-translate-y-0.5", t.acronym)}
      >
        R
      </span>
      <Fold open={open} delay={d(1)} className={cn("font-medium", t.folded)}>
        e
      </Fold>
      <span className={t.base}>Skill</span>
      {showSuffix && (
        <Fold open={open} delay={d(2)} className={cn("ml-0.5 font-semibold tracking-wide", s.suffix, t.suffix)}>
          .RIETC
        </Fold>
      )}
      {/* underline that draws itself under the full name */}
      <span
        className={cn(
          "absolute -bottom-1.5 left-0 h-[2px] w-full origin-left rounded-full bg-gradient-to-r transition-[scale,opacity] duration-700 ease-spring-smooth",
          t.bar,
          open ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
        )}
        style={{ transitionDelay: `${open ? 260 : 0}ms` }}
      />
    </span>
  );
}

/**
 * Linked logo.
 * - mode "unfold": renders as URSkill, then unfolds to the full name right after it appears (sidebar, auth panel).
 * - mode "hover":  stays URSkill (tight spaces like the phone top bar) and unfolds while hovered/focused.
 * - mode "mark":   monogram only (collapsed sidebar).
 */
export function BrandLogo({
  mode = "unfold",
  tone = "default",
  size = "sm",
  href = "/",
  className,
}: {
  mode?: "unfold" | "hover" | "mark";
  tone?: Tone;
  size?: Size;
  href?: string;
  className?: string;
}) {
  const [unfolded, setUnfolded] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (mode !== "unfold") return;
    // Let the browser paint "URSkill" first so the unfold is visible
    const t = window.setTimeout(() => setUnfolded(true), 450);
    return () => window.clearTimeout(t);
  }, [mode]);

  const open = mode === "unfold" ? unfolded : hovered;
  return (
    <Link
      href={href}
      aria-label={`${BRAND_NAME} หน้าแรก`}
      title={BRAND_NAME}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className={cn(
        "group/logo relative inline-flex min-w-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        SIZES[size].gap,
        className,
      )}
    >
      <BrandMark tone={tone} size={size} />
      {mode !== "mark" && <BrandWordmark open={mode === "unfold" && open} tone={tone} size={size} />}
      {mode === "hover" && (
        // No room to grow in place (phone top bar): the full name unfolds in a pill floating over the bar,
        // its monogram sitting exactly on top of the in-flow one
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-0 top-1/2 z-50 inline-flex w-max origin-left -translate-y-1/2 items-center rounded-xl bg-background/95 pb-2 pr-4 pt-2 shadow-lg ring-1 ring-border backdrop-blur transition-[opacity,scale] duration-300 ease-spring-snappy",
            SIZES[size].gap,
            open ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          <BrandMark tone={tone} size={size} className="-my-2" />
          <BrandWordmark open={open} tone={tone} size={size} />
        </span>
      )}
    </Link>
  );
}
