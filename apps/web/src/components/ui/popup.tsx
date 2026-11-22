"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { XIcon } from "./icons";
import { Backdrop, useOutside, usePresence, useScrollLock } from "./overlay";

const positions = {
  center: "items-center justify-center",
  top: "items-start justify-center",
  bottom: "items-end justify-center",
  "bottom-right": "items-end justify-end",
  "bottom-left": "items-end justify-start",
};

interface PopupProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Accessible name for the popup. */
  label: string;
  position?: keyof typeof positions;
  /** Modal popups dim the page, lock scrolling and close on outside click. Non-modal ones float above the page and only close via Esc or the close button. */
  modal?: boolean;
  showClose?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** A free-form popup surface for marketing and notification designs. Unlike Dialog it has no built-in header or padding. */
export function Popup({ open, onOpenChange, label, position = "center", modal = true, showClose = true, children, className }: PopupProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  useOutside(ref, close, open, modal);
  useScrollLock(open && modal);
  React.useEffect(() => {
    if (open && modal) ref.current?.querySelector<HTMLElement>("input,button:not([data-close])")?.focus();
  }, [open, modal]);
  const { mounted } = usePresence(open);
  if (!mounted) return null;
  return createPortal(
    <div className={cn("fixed inset-0 z-50 flex p-4", (!modal || !open) && "pointer-events-none", positions[position])}>
      {modal && <Backdrop closing={!open} />}
      <div
        ref={ref}
        role="dialog"
        aria-modal={modal}
        aria-label={label}
        className={cn(
          "relative w-full max-w-md overflow-hidden rounded-xl border bg-background shadow-xl",
          open && "pointer-events-auto",
          position === "center" ? (open ? "animate-zoom-in" : "animate-zoom-out") : open ? "animate-slide-up" : "animate-slide-down",
          className
        )}
      >
        {showClose && (
          <button
            data-close
            onClick={close}
            aria-label="ปิด"
            className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-muted-foreground backdrop-blur transition-[color,transform,translate,scale,rotate] duration-200 hover:rotate-90 hover:text-foreground"
          >
            <XIcon />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
