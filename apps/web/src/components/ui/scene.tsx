"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Backdrop, usePresence } from "./overlay";
import { prefersReducedMotion } from "./motion";

export interface Scene {
  /** A story icon (e.g. <LogoutIcon play={1} />); it is shown large and plays once. */
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}

/**
 * A short full-screen moment for actions that change where the user is — signing in or out, switching accounts —
 * so the transition reads as a place, not a flash. `run` shows the scene, waits for its story, then resolves.
 *
 *   const [scene, run] = useActionScene();
 *   await run({ icon: <LogoutIcon play={1} />, title: "กำลังออกจากระบบ" });
 */
export function useActionScene() {
  const [scene, setScene] = React.useState<Scene | null>(null);
  const run = React.useCallback(
    (s: Scene, ms = 1600) =>
      new Promise<void>((resolve) => {
        setScene(s);
        window.setTimeout(() => {
          setScene(null);
          resolve();
        }, prefersReducedMotion() ? 400 : ms);
      }),
    []
  );
  return [<SceneOverlay key="scene" scene={scene} />, run] as const;
}

function SceneOverlay({ scene }: { scene: Scene | null }) {
  const last = React.useRef(scene);
  if (scene) last.current = scene;
  const { mounted } = usePresence(!!scene, 200);
  const s = last.current;
  if (!mounted || !s) return null;
  return createPortal(
    <div role="status" aria-live="polite" className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <Backdrop closing={!scene} />
      <div className={cn("relative flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border bg-background px-8 py-10 text-center shadow-2xl", scene ? "animate-zoom-in" : "animate-zoom-out")}>
        <div className="flex min-h-14 max-w-full items-center justify-center text-foreground [&>svg]:h-14 [&>svg]:w-14">{s.icon}</div>
        <div>
          <p className="font-semibold">{s.title}</p>
          {s.subtitle && <p className="mt-1 text-sm text-muted-foreground">{s.subtitle}</p>}
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />)}
        </div>
      </div>
    </div>,
    document.body
  );
}
