"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ThemeToggle, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#how", label: "เรียนอย่างไร" },
  { href: "#courses", label: "หลักสูตรเด่น" },
  { href: "#events", label: "รอบอบรม" },
  { href: "/verify", label: "ตรวจสอบใบรับรอง" },
];

/** Sticky glassmorphic navbar with scroll-aware opacity and active section highlighting. */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [activeHash, setActiveHash] = useState("");

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);

      // Section highlight
      const sections = ["how", "courses", "events"];
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120 && rect.bottom >= 120) {
            setActiveHash(`#${id}`);
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-all duration-300",
        scrolled
          ? "border-border/80 bg-background/85 shadow-sm backdrop-blur-md"
          : "border-transparent bg-background/40 backdrop-blur-xs",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <BrandLogo mode="hover" className="sm:hidden" />
        <BrandLogo mode="unfold" className="hidden sm:inline-flex" />
        <div className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const isActive = activeHash === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "font-semibold text-primary"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                {l.label}
                {isActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary animate-fade-in" />
                )}
              </Link>
            );
          })}
        </div>
        <div className="flex-1" />
        <ThemeToggle />
        <Link href="/login" className={buttonClass("ghost", "sm", "px-2.5 sm:px-3")}>
          เข้าสู่ระบบ
        </Link>
        <Link href="/register" className={buttonClass("default", "sm", "shadow-sm")}>
          สมัครสมาชิก
        </Link>
      </nav>
    </header>
  );
}
