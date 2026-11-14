"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ThemeToggle, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#how", label: "เรียนอย่างไร" },
  { href: "#courses", label: "หลักสูตร" },
  { href: "/verify", label: "ตรวจสอบใบรับรอง" },
];

/** Transparent over the hero; gains a blurred surface and a hairline once the page scrolls. */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300",
        scrolled ? "border-border bg-background/80 shadow-xs backdrop-blur-md" : "border-transparent bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <BrandLogo mode="hover" className="sm:hidden" />
        <BrandLogo mode="unfold" className="hidden sm:inline-flex" />
        <div className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex-1" />
        <ThemeToggle />
        <Link href="/login" className={buttonClass("ghost", "sm", "px-2.5 sm:px-3")}>
          เข้าสู่ระบบ
        </Link>
        <Link href="/register" className={buttonClass("default", "sm")}>
          สมัครสมาชิก
        </Link>
      </nav>
    </header>
  );
}
