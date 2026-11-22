"use client";
import { BrandSignal } from "@/components/brand/BrandActivity";
import type { BrandState } from "@/components/brand/states";
import * as React from "react";
import { cn } from "@/lib/utils";

import { buttonClass, buttonSizes as sizes, buttonVariants as variants } from "./button-styles";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  loadingState?: BrandState;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", loading, loadingState, type = "button", disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...props}
    >
      {loading && <BrandSignal state={loadingState ?? (type === "submit" ? "saving" : "page-loading")} broadcast className="size-4" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";

export function Spinner({ className }: { className?: string }) {
  return <span role="status" aria-label="กำลังโหลด"><BrandSignal state="page-loading" className={cn("size-4", className)} /></span>;
}
