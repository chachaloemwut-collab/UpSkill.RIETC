"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
  leaving?: boolean;
}

const noop = () => () => {};
const ToastCtx = React.createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => React.useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const dismiss = (id: number) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 150);
  };
  const toast = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => dismiss(id), 3500);
  }, []);
  const mounted = React.useSyncExternalStore(noop, () => true, () => false);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {mounted && createPortal(
        <div className="fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={cn(
                "flex items-start gap-3 rounded-lg border bg-background p-4 shadow-lg",
                t.leaving ? "animate-slide-down" : "animate-slide-up",
                t.variant === "success" && "border-success/30",
                t.variant === "destructive" && "border-destructive/30"
              )}
            >
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full bg-foreground", t.variant === "success" && "bg-success", t.variant === "destructive" && "bg-destructive")} />
              <div className="grid flex-1 gap-0.5">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted-foreground transition-colors hover:text-foreground">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}
