import Link from "next/link";
import { ArrowLeft, Award, PlayCircle, ShieldCheck } from "lucide-react";
import { BRAND_NAME, BrandLogo } from "@/components/brand/BrandLogo";
import { ThemeToggle, buttonClass } from "@/components/ui";

const POINTS = [
  { icon: PlayCircle, title: "เรียนจากวิดีโอคุณภาพ", text: "บทเรียนจาก YouTube จัดเป็นหลักสูตรอย่างเป็นระบบ" },
  { icon: ShieldCheck, title: "นับเวลาเรียนจริง", text: "ระบบกันโกงฝั่งเซิร์ฟเวอร์ ข้ามหรือเร่งวิดีโอไม่ได้" },
  { icon: Award, title: "ใบรับรองที่ตรวจสอบได้", text: "ลงนามดิจิทัล Ed25519 พร้อม QR Code" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary-foreground/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-primary-foreground/5 blur-3xl" />
        <div className="relative my-auto max-w-md">
          <BrandLogo mode="unfold" tone="inverted" size="lg" className="mb-10" />
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">เรียนรู้ทักษะใหม่ ได้ใบรับรองที่เชื่อถือได้</h2>
          <p className="mt-3 text-primary-foreground/70">Minimalist Features, Maximum Integrity</p>
          <ul className="mt-10 grid gap-6">
            {POINTS.map((p, i) => (
              <li key={p.title} className="flex animate-slide-up gap-4 [animation-fill-mode:both]" style={{ animationDelay: `${120 + i * 90}ms` }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10">
                  <p.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="text-sm text-primary-foreground/70">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-primary-foreground/50">© {BRAND_NAME}</p>
      </aside>
      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className={buttonClass("ghost", "sm", "group -ml-2 text-muted-foreground hover:text-foreground")}>
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" /> กลับหน้าแรก
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto my-auto w-full max-w-sm animate-slide-up py-10">
          {/* The brand panel is hidden below lg: show the logo above the form instead */}
          <BrandLogo mode="unfold" className="mb-8 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
