"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Backdrop, Dialog, useOutside, usePresence, useScrollLock } from "./overlay";
import { XIcon } from "./icons";
import { useSwipeDismiss } from "./motion";

/* ---------- Alert Dialog ---------- */
interface AlertDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
}

export function AlertDialog({ open, onOpenChange, title, description, confirmLabel = "Continue", cancelLabel = "Cancel", destructive, onConfirm }: AlertDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      dismissible={false}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm?.();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

/* ---------- Sheet & Drawer ---------- */
const sides = {
  right: "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l animate-slide-in-right data-[state=closed]:animate-slide-out-right",
  left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r animate-slide-in-left data-[state=closed]:animate-slide-out-left",
  bottom: "inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl border-t animate-slide-in-bottom data-[state=closed]:animate-slide-out-bottom",
};

export interface SheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  side?: keyof typeof sides;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export function Sheet({ open, onOpenChange, side = "right", title, description, children, footer }: SheetProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  useOutside(ref, close, open);
  useScrollLock(open);
  const { mounted, state } = usePresence(open);
  // Bottom drawers are dragged by their header (so the content can still scroll); side sheets by the whole panel.
  const swipe = useSwipeDismiss(ref, side === "bottom" ? "down" : side, close);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 data-[state=closed]:pointer-events-none" data-state={state}>
      <Backdrop closing={!open} />
      <div
        ref={ref}
        data-state={state}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        {...(side !== "bottom" && swipe)}
        className={cn("fixed flex flex-col bg-background p-6 shadow-lg", side !== "bottom" && "touch-pan-y", sides[side])}
      >
        <div className={cn("flex min-h-0 flex-1 flex-col gap-4", side === "bottom" && "mx-auto w-full max-w-md")}>
          {side === "bottom" && (
            <div {...swipe} className="-mx-6 -mt-6 cursor-grab touch-none px-6 pb-1 pt-4 active:cursor-grabbing">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-muted transition-[width,background-color] duration-300 [div:active>&]:w-16 [div:active>&]:bg-muted-foreground/40" />
            </div>
          )}
          {side !== "bottom" && (
            <button onClick={close} aria-label="Close" className="absolute right-4 top-4 rounded-sm text-muted-foreground transition-[color,transform,translate,scale,rotate] duration-200 hover:rotate-90 hover:text-foreground">
              <XIcon />
            </button>
          )}
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>}
          {footer && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function Drawer(props: Omit<SheetProps, "side">) {
  return <Sheet {...props} side="bottom" />;
}

/* ---------- Empty State ---------- */
export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-6 py-12 text-center", className)}>
      {icon && <div className="mb-2 flex h-12 w-12 animate-float items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</div>}
      <h3 className="font-medium">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
