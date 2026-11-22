"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ThemeToggle, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#how", label: "เรียนอย่างไร" },
  { href: "#courses", label: "หลักสูตร" },
  { href: "#events", label: "รอบอบรม" },
  { href: "#verify", label: "ตรวจสอบเอกสาร" },
];
const SECTIONS = LINKS.map((l) => l.href.slice(1));

/** Sticky navbar: scroll-aware background, active-section highlight, and a menu panel on small screens. */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [activeHash, setActiveHash] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
      let active = "";
      for (const id of SECTIONS) {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        if (rect && rect.top <= 120 && rect.bottom >= 120) active = `#${id}`;
      }
      setActiveHash(active);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300",
        scrolled || open ? "border-border/80 bg-background/90 shadow-sm backdrop-blur-md" : "border-transparent bg-background/40 backdrop-blur-xs",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <BrandLogo mode="mark" className="sm:hidden" />
        <BrandLogo mode="unfold" className="hidden sm:inline-flex" />
        <div className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const isActive = activeHash === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive ? "font-semibold text-primary" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {l.label}
                {isActive && <span className="absolute bottom-0 left-3 right-3 h-0.5 animate-fade-in rounded-full bg-primary" />}
              </Link>
            );
          })}
        </div>
        <div className="flex-1" />
        <ThemeToggle />
        <Link href="/login" className={buttonClass("ghost", "sm", "hidden px-3 sm:inline-flex")}>
          เข้าสู่ระบบ
        </Link>
        <Link href="/register" className={buttonClass("default", "sm", "shadow-sm")}>
          สมัครสมาชิก
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div id="landing-mobile-menu" className="animate-slide-up border-t md:hidden">
          <div className="mx-auto grid max-w-6xl gap-1 px-4 py-3 sm:px-6">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                {l.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className={buttonClass("outline", "md", "mt-2 sm:hidden")}>
              เข้าสู่ระบบ
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
