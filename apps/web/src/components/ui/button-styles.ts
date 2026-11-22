// Server-safe (no "use client"): lets server components style a <Link> exactly like a <Button>.
import { cn } from "@/lib/utils";

export const buttonVariants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  link: "text-foreground underline-offset-4 hover:underline",
};
export const buttonSizes = {
  // Sized for touch: every variant stays >= 36px tall and icon-only buttons are 40px taps.
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6 text-base",
  icon: "h-10 w-10 shrink-0",
};

export function buttonClass(variant: keyof typeof buttonVariants = "default", size: keyof typeof buttonSizes = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[color,background-color,box-shadow,transform,translate,scale,rotate] duration-[400ms] active:scale-[0.96] active:duration-75",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}
