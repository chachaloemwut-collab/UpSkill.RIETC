"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BRAND_NAME, brandStates, type BrandState, type WordMotion } from "./states";
import "./kinetic-wordmark.css";

type Motion = { state: BrandState; word?: WordMotion | "still" };
type Register = (motion: Motion) => () => void;
const RegisterContext = createContext<Register>(() => () => {});
const CurrentContext = createContext<Motion>({ state: "hero-reveal" });
const subscribeNavigationType = () => () => {};
const isReload = () => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload";

export function BrandActivityProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reload = useSyncExternalStore(subscribeNavigationType, isReload, () => false);
  const [route, setRoute] = useState<{ path: string; word?: WordMotion }>({ path: pathname });
  if (route.path !== pathname) setRoute({ path: pathname, word: pathname === "/" ? "typewriter-ribbon" : "domino-nudge" });
  const [settledPath, setSettledPath] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledPath(pathname), 2500);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  const [active, setActive] = useState<Motion[]>([]);
  const register = useCallback<Register>((motion) => {
    setActive((list) => [...list, motion]);
    return () => setActive((list) => list.filter((entry) => entry !== motion));
  }, []);
  const entryWord = route.word ?? (reload ? "accordion-unfold" : "pixar-dot-hop");
  const current: Motion = active.at(-1) ?? { state: "hero-reveal", word: settledPath === pathname ? "still" : entryWord };
  return <RegisterContext.Provider value={register}><CurrentContext.Provider value={current}>{children}</CurrentContext.Provider></RegisterContext.Provider>;
}

/** Play a single non-blocking response to an immediate action such as switching themes. */
export function useBrandPulse() {
  const register = useContext(RegisterContext);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  return useCallback((motion: Motion) => {
    stop.current();
    const release = register(motion);
    const timer = window.setTimeout(release, 2200);
    stop.current = () => { window.clearTimeout(timer); release(); };
  }, [register]);
}

export const useHeaderMotion = () => useContext(CurrentContext);

const actors: Partial<Record<WordMotion, [string, string?]>> = {
  "pixar-dot-hop": ["ball"], "dot-juggling": ["ball"], "typewriter-ribbon": ["cursor"],
  "sleepy-offline": ["zzz", "zZz"], "confused-wobble": ["q", "?"], "magnifying-walk": ["lens"],
  "confetti-burst": ["conf"], "trophy-crown": ["crown", "👑"], "laser-xray-verify": ["laser"], "share-paperplane": ["plane", "✈"],
};
const letters = Array.from(BRAND_NAME, (char, i) => ({
  char, style: { "--i": i } as CSSProperties,
  group: i < 7 ? "up" : i < 14 ? "re" : i === 14 ? "dot" : "rietc",
  shape: i === 0 || i === 7 ? "anchor" : i < 14 ? "mid" : "",
}));

/** Decorative artwork. The containing link, button or status supplies the accessible name. */
export function BrandArt({ state, word, full = false, large = false, inverted = false, className }: Motion & {
  full?: boolean; large?: boolean; inverted?: boolean; className?: string;
}) {
  const motion = word === "still" ? null : word ?? brandStates[state];
  const src = word === "still" ? "/favicon.svg" : `/brand/states/${state}.svg`;
  if (!full) return <Image unoptimized src={src} width={32} height={32} alt="" aria-hidden className={cn("size-5 shrink-0", className)} />;
  const actor = motion ? actors[motion] : undefined;
  return (
    <span key={motion ?? state} aria-hidden data-wordmark={motion ?? "static"} className={cn("ur-kw", motion && `ur-k-${motion}`, large && "ur-big", inverted && "ur-inverted", className)}>
      <Image unoptimized className="ur-kw-badge" src={motion ? "/favicon.svg" : src} width={32} height={32} alt="" />
      <span className="ur-kw-word">
        {actor && <span className={`ur-actor ur-actor-${actor[0]}`}>{actor[1]}</span>}
        {letters.map(({ char, style, group, shape }, i) => <span key={i} className={`ur-ch ${group} ${shape}`} data-c={char} style={style}>{char}</span>)}
      </span>
    </span>
  );
}

/** A live operation can also drive the masthead while its compact feedback is on screen. */
export function BrandSignal({ state, word, broadcast = false, ...art }: Parameters<typeof BrandArt>[0] & { broadcast?: boolean }) {
  const register = useContext(RegisterContext);
  useEffect(() => {
    if (broadcast) return register(word ? { state, word } : { state });
  }, [broadcast, register, state, word]);
  return <BrandArt state={state} {...(word ? { word } : {})} {...art} />;
}
