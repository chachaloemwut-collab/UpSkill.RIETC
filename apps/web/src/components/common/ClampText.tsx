"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Long text that is cut to a few lines on phones (with "อ่านเพิ่มเติม") so the page's main action stays near the top;
 * shown in full from the sm breakpoint up.
 */
export function ClampText({ children, className }: { children: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = children.length > 280 || children.split("\n").length > 5;
  return (
    <div className={className}>
      <p className={cn("whitespace-pre-line", long && !open && "line-clamp-5 sm:line-clamp-none")}>{children}</p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 inline-flex h-10 items-center text-sm font-medium text-primary sm:hidden"
        >
          {open ? "ย่อรายละเอียด" : "อ่านเพิ่มเติม"}
        </button>
      )}
    </div>
  );
}
