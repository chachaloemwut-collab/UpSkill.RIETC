"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The spring easings defined in index.css, for Web Animations (`el.animate`) which can't read `var()`. */
export function springEasing(name: "smooth" | "snappy" | "bouncy") {
  return getComputedStyle(document.documentElement).getPropertyValue(`--ease-spring-${name}`).trim() || "ease-out";
}

/** Plays a quick shrink-and-fade on `el`, then calls `done` (typically the state update that removes it). */
export function animateOut(el: Element | null | undefined, done: () => void) {
  if (!el || prefersReducedMotion()) return done();
  el.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.9)" }], { duration: 150, easing: "ease-in", fill: "forwards" }).finished.then(done);
}

/* ---------- Swipe to dismiss ---------- */
/**
 * Lets the user drag `ref` toward `direction` to dismiss it. Past 35% of its size, or on a quick flick, `onDismiss`
 * runs and the element's own exit animation carries on from where the finger left it; otherwise it springs back.
 * Dragging the other way is rubber-banded. Spread the returned handlers on the drag handle (or the element itself).
 */
export function useSwipeDismiss(ref: React.RefObject<HTMLElement | null>, direction: "down" | "left" | "right", onDismiss: () => void) {
  const cleanup = React.useRef<() => void>(() => {});
  React.useEffect(() => () => cleanup.current(), []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || prefersReducedMotion() || (e.target as HTMLElement).closest("button,a,input,textarea,select,label,[role=slider]")) return;
    const sign = direction === "left" ? -1 : 1;
    const coord = (ev: PointerEvent) => (direction === "down" ? ev.clientY : ev.clientX);
    const place = (px: number, animate: boolean) => {
      const el = ref.current;
      if (!el) return;
      el.style.transition = animate ? `transform 500ms ${springEasing("snappy")}` : "none";
      el.style.transform = px === 0 ? "" : direction === "down" ? `translateY(${px}px)` : `translateX(${px}px)`;
    };
    const start = direction === "down" ? e.clientY : e.clientX;
    let prev = start, prevT = e.timeStamp, last = start, lastT = e.timeStamp, moved = false;

    // Follow the pointer on window rather than capturing it, so plain clicks inside still reach their targets
    // and a fast flick that leaves the handle in one frame isn't lost.
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const c = coord(ev);
      const dist = (c - start) * sign;
      if (!moved) {
        if (Math.abs(dist) < 4) return;
        moved = true;
        window.getSelection()?.removeAllRanges();
      }
      prev = last;
      prevT = lastT;
      last = c;
      lastT = ev.timeStamp;
      // 1:1 toward dismissal; rubber-banded (diminishing returns) the other way.
      place((dist > 0 ? dist : -Math.sqrt(-dist) * 3) * sign, false);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      cleanup.current();
      if (!moved) return;
      const dist = (coord(ev) - start) * sign;
      const velocity = ((last - prev) / Math.max(1, lastT - prevT)) * sign; // px per ms, toward dismissal
      const size = (direction === "down" ? ref.current?.offsetHeight : ref.current?.offsetWidth) ?? 1;
      if (ev.type === "pointerup" && (dist > size * 0.35 || (velocity > 0.5 && dist > 12))) onDismiss();
      else place(0, true);
    };
    cleanup.current();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      cleanup.current = () => {};
    };
  };
  return { onPointerDown };
}

/* ---------- Sliding indicator ---------- */
/**
 * Measures the child of `ref` matching `selector` (e.g. the selected tab) so a single highlight can slide between items.
 * Re-measures whenever `key` changes or the container resizes.
 */
export function useIndicator(ref: React.RefObject<HTMLElement | null>, selector: string, key: unknown) {
  const [rect, setRect] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);
  React.useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLElement>(selector);
      setRect(el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [ref, selector, key]);
  return rect;
}

/** The highlight that `useIndicator` positions. Its parent must be `relative`, and the items `relative z-10`. */
export function Indicator({ rect, className }: { rect: ReturnType<typeof useIndicator>; className?: string }) {
  return (
    <span
      aria-hidden
      style={rect ?? { opacity: 0 }}
      className={cn("pointer-events-none absolute rounded-md transition-[left,top,width,height,opacity] duration-[450ms] ease-spring-snappy", className)}
    />
  );
}

/* ---------- Scroll progress ---------- */
/**
 * Writes how far the page has scrolled through `ref` to the CSS variable `--p` on it: 0 when its top reaches the
 * viewport top, 1 when its bottom reaches the viewport bottom. Pair with a tall section and a `sticky` child, then
 * drive styles with `calc(var(--p) …)`. Updates once per frame and never re-renders React.
 * Under reduced motion `--p` is pinned to `reducedValue`.
 */
export function useScrollProgress(ref: React.RefObject<HTMLElement | null>, reducedValue = 1) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return el.style.setProperty("--p", String(reducedValue));
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total > 0 ? -r.top / total : r.top < 0 ? 1 : 0;
      el.style.setProperty("--p", Math.min(1, Math.max(0, p)).toFixed(4));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [ref, reducedValue]);
}

/* ---------- In-view ---------- */
/** True once the element scrolls into view (or every time it does, when `once` is false). */
export function useInView<T extends Element>(ref: React.RefObject<T | null>, { once = true, rootMargin = "0px 0px -10% 0px" } = {}) {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        setInView(true);
        if (once) io.disconnect();
      } else if (!once) setInView(false);
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, rootMargin]);
  return inView;
}

/* ---------- Reveal ---------- */
const hidden = {
  up: "translate-y-6 opacity-0",
  down: "-translate-y-6 opacity-0",
  left: "translate-x-6 opacity-0",
  right: "-translate-x-6 opacity-0",
  scale: "scale-90 opacity-0",
  fade: "opacity-0",
};

/** Fades and slides its children in when they scroll into view. */
export function Reveal({ children, from = "up", delay = 0, className }: { children: React.ReactNode; from?: keyof typeof hidden; delay?: number; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn("transition-[opacity,transform,translate,scale,rotate] duration-[900ms] ease-spring-smooth", !inView && hidden[from], className)}
    >
      {children}
    </div>
  );
}

/* ---------- Animated number ---------- */
/** Counts from its previous value to `value` (starting from 0 once it scrolls into view). */
export function AnimatedNumber({ value, duration = 1200, format = (n) => Math.round(n).toLocaleString(), className }: { value: number; duration?: number; format?: (n: number) => string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const [display, setDisplay] = React.useState(0);
  const from = React.useRef(0);
  React.useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion()) return setDisplay(value);
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = origin + (value - origin) * (1 - Math.pow(1 - t, 3));
      from.current = v;
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, inView]);
  return <span ref={ref} className={cn("tabular-nums", className)}>{format(display)}</span>;
}

/* ---------- Shake ---------- */
/** `shake()` plays a horizontal shake on the element holding `ref` — use it to reject invalid input without remounting it. */
export function useShake<T extends HTMLElement = HTMLDivElement>() {
  const ref = React.useRef<T>(null);
  const shake = React.useCallback(() => {
    if (prefersReducedMotion()) return;
    ref.current?.animate(
      [0, -6, 6, -6, 6, 0].map((x) => ({ transform: `translateX(${x}px)` })),
      { duration: 400, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" }
    );
  }, []);
  return { ref, shake };
}

/* ---------- Ripple ---------- */
/** Material-style ripple. Spread `bind` onto a `relative overflow-hidden` element and render `ripples` inside it. */
export function useRipple() {
  const [ripples, setRipples] = React.useState<{ id: number; x: number; y: number; size: number }[]>([]);
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const id = Date.now() + Math.random();
    setRipples((rs) => [...rs, { id, x: e.clientX - r.left - size / 2, y: e.clientY - r.top - size / 2, size }]);
    setTimeout(() => setRipples((rs) => rs.filter((p) => p.id !== id)), 600);
  };
  return {
    bind: { onPointerDown },
    ripples: ripples.map((p) => (
      <span key={p.id} aria-hidden className="pointer-events-none absolute animate-ripple rounded-full bg-current" style={{ left: p.x, top: p.y, width: p.size, height: p.size }} />
    )),
  };
}

/* ---------- Tilt ---------- */
/** Tilts in 3D toward the pointer, with a glare highlight. */
export function TiltCard({ children, max = 12, className }: { children: React.ReactNode; max?: number; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(700px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) scale(1.02)`;
    el.style.setProperty("--gx", `${px * 100}%`);
    el.style.setProperty("--gy", `${py * 100}%`);
  };
  const reset = () => ref.current && (ref.current.style.transform = "");
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={cn("group/tilt relative transition-transform duration-500 ease-spring-snappy will-change-transform", className)}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity group-hover/tilt:opacity-100"
        style={{ background: "radial-gradient(circle at var(--gx) var(--gy), rgb(255 255 255 / 0.25), transparent 50%)" }}
      />
    </div>
  );
}

/* ---------- Spotlight ---------- */
/** A card whose border and surface light up around the pointer. */
export function SpotlightCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--sx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--sy", `${e.clientY - r.top}px`);
  };
  return (
    <div onPointerMove={onMove} className={cn("group/spot relative overflow-hidden rounded-lg border bg-card p-6", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{ background: "radial-gradient(240px circle at var(--sx) var(--sy), hsl(var(--foreground) / 0.08), transparent 70%)" }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

/* ---------- Magnetic ---------- */
/** Pulls its child a little toward the pointer while hovered. */
export function Magnetic({ children, strength = 0.3 }: { children: React.ReactNode; strength?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength}px)`;
  };
  return (
    <span ref={ref} onPointerMove={onMove} onPointerLeave={() => ref.current && (ref.current.style.transform = "")} className="inline-block transition-transform duration-[650ms] ease-spring-bouncy">
      {children}
    </span>
  );
}

/* ---------- Typewriter ---------- */
export function Typewriter({ words, speed = 70, pause = 1400, className }: { words: string[]; speed?: number; pause?: number; className?: string }) {
  const [i, setI] = React.useState(0);
  const [text, setText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  React.useEffect(() => {
    const word = words[i % words.length];
    const done = !deleting && text === word;
    const t = window.setTimeout(
      () => {
        if (done) return setDeleting(true);
        if (deleting && text === "") {
          setDeleting(false);
          return setI((x) => x + 1);
        }
        setText(deleting ? word!.slice(0, text.length - 1) : word!.slice(0, text.length + 1));
      },
      done ? pause : deleting ? speed / 2 : speed
    );
    return () => window.clearTimeout(t);
  }, [text, deleting, i, words, speed, pause]);
  return (
    <span className={className}>
      {text}
      <span aria-hidden className="ml-0.5 inline-block w-[2px] animate-blink self-stretch bg-current align-[-0.1em]" style={{ height: "1em" }} />
    </span>
  );
}

/* ---------- Confetti ---------- */
const CONFETTI_COLORS = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

/** Fires a burst of confetti from a point on screen (defaults to the center). Skipped under reduced motion. */
export function confetti({ x = window.innerWidth / 2, y = window.innerHeight / 2, count = 120, spread = 360, angle = -90, velocity = 11 } = {}) {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const rad = (d: number) => (d * Math.PI) / 180;
  const parts = Array.from({ length: count }, () => {
    const a = rad(angle + (Math.random() - 0.5) * spread);
    const v = velocity * (0.5 + Math.random() * 0.7);
    return {
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      w: 6 + Math.random() * 5,
      h: 4 + Math.random() * 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      life: 0,
    };
  });
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    for (const p of parts) {
      p.life++;
      p.vy += 0.25;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      const alpha = Math.max(0, 1 - p.life / 140);
      if (alpha <= 0 || p.y > window.innerHeight + 20) continue;
      alive++;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color!;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.cos(p.life / 6));
      ctx.restore();
    }
    if (alive) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

/** Confetti bursting from the center of an element, e.g. the button that was clicked. */
export function confettiFrom(el: Element, opts: Parameters<typeof confetti>[0] = {}) {
  const r = el.getBoundingClientRect();
  confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 60, velocity: 8, ...opts });
}

/* ---------- Fly to ---------- */
/**
 * Sends a copy of `from` along an arc into `to` (e.g. a product photo into the cart), shrinking as it goes, like an
 * object being picked up and dropped in. Resolves when it lands so the caller can react (bump the cart, count up).
 */
export function flyTo(from: Element, to: Element, { duration = 750 }: { duration?: number } = {}) {
  if (prefersReducedMotion()) return Promise.resolve();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, {
    position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: "0",
    zIndex: "100", pointerEvents: "none", borderRadius: "14px", overflow: "hidden", boxShadow: "0 12px 30px -8px rgb(0 0 0 / 0.35)",
  });
  ghost.removeAttribute("id");
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const end = Math.max(0.08, Math.min(b.width / a.width, b.height / a.height) * 0.6);
  const lift = Math.max(60, Math.abs(dx) * 0.25); // how high the arc climbs above the straight line
  // Sample a quadratic Bézier so the ghost travels on a real curve, not two straight legs.
  const frames = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    const cx = dx * 0.5, cy = Math.min(0, dy) - lift;
    const x = 2 * (1 - t) * t * cx + t * t * dx;
    const y = 2 * (1 - t) * t * cy + t * t * dy;
    const s = t < 0.15 ? 1 + t * 0.6 : 1.09 - (1.09 - end) * ((t - 0.15) / 0.85); // lifts slightly, then shrinks
    return { transform: `translate(${x}px, ${y}px) scale(${s}) rotate(${t * -12}deg)`, opacity: t > 0.92 ? 0 : 1 };
  });
  return ghost
    .animate(frames, { duration, easing: "cubic-bezier(0.45, 0, 0.55, 1)" })
    .finished.catch(() => undefined)
    .then(() => ghost.remove());
}

/** A springy "catch" on `el`, for the target of `flyTo` or anything that just received something. */
export function bump(el: Element | null | undefined, scale = 1.25) {
  if (!el || prefersReducedMotion()) return;
  el.animate([{ transform: "scale(1)" }, { transform: `scale(${scale})`, offset: 0.25 }, { transform: "scale(1)" }], { duration: 600, easing: springEasing("smooth") });
}

/* ---------- Rolling number ---------- */
/** Odometer-style number: each digit rolls to its new value, and new places slide in. */
export function RollingNumber({ value, format = (n) => n.toLocaleString(), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const text = format(value);
  const chars = text.split("");
  return (
    <span className={cn("inline-flex tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      {chars.map((c, i) => {
        // Key from the right so the ones place keeps its column when the number gains a digit.
        const k = chars.length - i;
        return /\d/.test(c) ? <Digit key={k} d={Number(c)} /> : <span key={`s${k}`} aria-hidden>{c}</span>;
      })}
    </span>
  );
}

function Digit({ d }: { d: number }) {
  return (
    <span aria-hidden className="relative inline-block h-[1.15em] w-[1ch] animate-slide-up overflow-hidden">
      <span className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[650ms] ease-spring-snappy" style={{ transform: `translateY(${-d * 1.15}em)` }}>
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="flex h-[1.15em] items-center justify-center">{n}</span>
        ))}
      </span>
    </span>
  );
}
