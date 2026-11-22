"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { BrandArt, useHeaderMotion } from "./BrandActivity";
import { BRAND_NAME } from "./states";

export function BrandLogo({ mode = "unfold", tone = "default", size = "sm", href = "/", className }: {
  mode?: "unfold" | "mark"; tone?: "default" | "inverted"; size?: "sm" | "lg"; href?: string; className?: string;
}) {
  const motion = useHeaderMotion();
  const full = mode === "unfold";
  return (
    <Link href={href} aria-label={`${BRAND_NAME} หน้าแรก`} title={BRAND_NAME}
      className={cn("inline-flex min-w-0 shrink-0 items-center rounded-md focus-visible:outline-2 focus-visible:outline-ring", className)}>
      <BrandArt {...motion} full={full} large={size === "lg"} inverted={tone === "inverted"} {...(!full ? { className: "size-8" } : {})} />
    </Link>
  );
}
