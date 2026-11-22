"use client";
import { BrandSignal } from "@/components/brand/BrandActivity";
import type { BrandState } from "@/components/brand/states";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = {
  default: "bg-primary text-primary-foreground border-transparent",
  secondary: "bg-secondary text-secondary-foreground border-transparent",
  outline: "text-foreground",
  success: "border-transparent bg-success/10 text-success",
  warning: "border-transparent bg-warning/10 text-warning",
  destructive: "border-transparent bg-destructive/10 text-destructive",
};

export function Badge({ variant = "default", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof badgeVariants }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", badgeVariants[variant], className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border bg-card text-card-foreground", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-semibold leading-none tracking-tight", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 p-5 pt-0", className)} {...props} />;
}

const alertVariants = {
  default: "text-foreground",
  success: "border-success/30 text-success [&_p]:text-success/80",
  warning: "border-warning/30 text-warning [&_p]:text-warning/80",
  destructive: "border-destructive/30 text-destructive [&_p]:text-destructive/80",
};
const alertIcons = {
  default: <path d="M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />,
  success: <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3" />,
  warning: <path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3ZM12 9v4M12 17h.01" />,
  destructive: <path d="M12 8v4M12 16h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />,
};

export function Alert({ variant = "default", title, children, brandState }: { brandState?: BrandState; variant?: keyof typeof alertVariants; title: string; children?: React.ReactNode }) {
  return (
    <div role="alert" className={cn("flex animate-slide-up gap-3 rounded-lg border bg-card p-4", alertVariants[variant])}>
      {brandState ? <BrandSignal state={brandState} broadcast className="size-5" /> : <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {alertIcons[variant]}
      </svg>}
      <div className="grid gap-1">
        <h5 className="text-sm font-medium leading-none">{title}</h5>
        {children && <p className="text-sm text-muted-foreground">{children}</p>}
      </div>
    </div>
  );
}

export function Avatar({ src, name, size = 36, className }: { src?: string; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span style={{ width: size, height: size }} className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground", className)}>
      {src && !failed ? <img src={src} alt={name} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className={cn("h-full w-full object-cover transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")} /> : initials}
    </span>
  );
}

export function AvatarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex -space-x-2 [&>*]:ring-2 [&>*]:ring-background [&>*]:transition-[translate] [&>*:hover]:z-10 [&>*:hover]:-translate-y-1">{children}</div>;
}

export function Separator({ vertical, className }: { vertical?: boolean; className?: string }) {
  return <div role="separator" className={cn("shrink-0 bg-border", vertical ? "h-full w-px" : "h-px w-full", className)} />;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div className="h-full rounded-full bg-primary transition-all duration-700 ease-spring-smooth" style={{ width: `${value}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground", className)} {...props} />;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border">
      <table className={cn("w-full caption-bottom whitespace-nowrap text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:h-10 [&_th]:px-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_tr]:border-b [&_tbody_tr:last-child]:border-0 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/50", className)} {...props} />
    </div>
  );
}
