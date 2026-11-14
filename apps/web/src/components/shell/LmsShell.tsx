"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, type ReactNode } from "react";
import {
  Award, BookOpen, CalendarRange, GraduationCap, LayoutDashboard, Library, LogIn, Megaphone, Presentation, Search, Settings, ShieldAlert, ShieldCheck, UserPlus, UsersRound,
} from "lucide-react";
import {
  AppShell, Avatar, Button, DropdownMenu, InputGroup, LogoutIcon, ThemeCustomizer, ThemeToggle, buttonClass, useActionScene, useToast,
  type ShellNavGroup,
} from "@/components/ui";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { api } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/format";

export interface ShellUser {
  name: string;
  email: string;
  role: "member" | "instructor" | "admin";
}

function buildNav(user: ShellUser | null): ShellNavGroup[] {
  const groups: ShellNavGroup[] = [
    {
      label: "เรียนรู้",
      items: [
        { id: "/", href: "/", label: user ? "แดชบอร์ด" : "หน้าแรก", icon: <LayoutDashboard /> },
        { id: "/courses", href: "/courses", label: "คลังหลักสูตร", icon: <Library /> },
        { id: "/programs", href: "/programs", label: "หลักสูตรอบรม", icon: <GraduationCap /> },
        { id: "/announcements", href: "/announcements", label: "ประกาศและกิจกรรม", icon: <Megaphone /> },
        ...(user
          ? [
              { id: "/my-courses", href: "/my-courses", label: "คอร์สของฉัน", icon: <BookOpen /> },
              { id: "/certificates", href: "/certificates", label: "ใบรับรองของฉัน", icon: <Award /> },
            ]
          : []),
        { id: "/verify", href: "/verify", label: "ตรวจสอบใบรับรอง", icon: <ShieldCheck /> },
      ],
    },
  ];
  if (user && (user.role === "instructor" || user.role === "admin")) {
    groups.push({ label: "ผู้สอน", items: [{ id: "/instructor", href: "/instructor", label: "จัดการหลักสูตร", icon: <Presentation /> }, { id: "/assignments", href: "/assignments", label: "มอบหมายหลักสูตร", icon: <UsersRound /> }] });
  }
  if (user?.role === "admin") {
    groups.push({
      label: "ผู้ดูแลระบบ",
      items: [
        { id: "/admin", href: "/admin", label: "ภาพรวมระบบ", icon: <ShieldAlert /> },
        { id: "/admin/programs", href: "/admin/programs", label: "หลักสูตรและรอบอบรม", icon: <CalendarRange /> },
        { id: "/admin/announcements", href: "/admin/announcements", label: "ประกาศประชาสัมพันธ์", icon: <Megaphone /> },
      ],
    });
  }
  if (user) groups.push({ label: "บัญชี", items: [{ id: "/me", href: "/me", label: "ตั้งค่าบัญชี", icon: <Settings /> }] });
  return groups;
}

/** The nav item whose href is the longest prefix of the current path ("/" only matches exactly). */
function activeId(nav: ShellNavGroup[], pathname: string): string {
  let best = "";
  for (const item of nav.flatMap((g) => g.items)) {
    const id = item.id;
    const match = id === "/" ? pathname === "/" : pathname === id || pathname.startsWith(`${id}/`);
    if (match && id.length > best.length) best = id;
  }
  return best;
}

export function LmsShell({ user, children }: { user: ShellUser | null; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [scene, runScene] = useActionScene();
  const nav = useMemo(() => buildNav(user), [user]);
  const active = activeId(nav, pathname);
  const title = nav.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? "UpskillReskill.RIETC";

  const signOut = useCallback(async () => {
    const done = api("/api/auth/logout", { method: "POST" });
    await runScene({ icon: <LogoutIcon play={1} />, title: "กำลังออกจากระบบ", subtitle: "แล้วพบกันใหม่" }, 1200);
    await done;
    router.push("/");
    router.refresh();
    toast({ title: "ออกจากระบบแล้ว", variant: "success" });
  }, [runScene, router, toast]);

  // URSkill unfolds into the full name once the shell appears
  const brand = <BrandLogo mode="unfold" />;

  return (
    <>
      {scene}
      <AppShell
        brand={brand}
        brandIcon={<BrandLogo mode="mark" className="mx-auto" />}
        nav={nav}
        active={active}
        header={<TopBar title={title} user={user} onSignOut={signOut} />}
        sidebarFooter={(collapsed) =>
          user ? (
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size={32} />
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 animate-fade-in text-sm">
                    <p className="truncate font-medium">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="ออกจากระบบ" onClick={signOut} className="animate-fade-in text-muted-foreground hover:text-destructive">
                    <LogoutIcon />
                  </Button>
                </>
              )}
            </div>
          ) : collapsed ? (
            <Link href="/login" aria-label="เข้าสู่ระบบ" className={buttonClass("ghost", "icon", "mx-auto flex")}>
              <LogIn />
            </Link>
          ) : (
            <div className="grid gap-2">
              <Link href="/register" className={buttonClass("default", "sm")}>
                <UserPlus /> สมัครสมาชิก
              </Link>
              <Link href="/login" className={buttonClass("outline", "sm")}>
                <LogIn /> เข้าสู่ระบบ
              </Link>
            </div>
          )
        }
      >
        <div key={pathname} className="mx-auto max-w-7xl animate-slide-up">
          {children}
        </div>
      </AppShell>
    </>
  );
}

function TopBar({ title, user, onSignOut }: { title: string; user: ShellUser | null; onSignOut: () => void }) {
  const router = useRouter();
  return (
    <>
      {/* Phones: compact "URSkill" (no room for the full name beside the actions); unfolds on hover/focus */}
      <BrandLogo mode="hover" className="md:hidden" />
      <p className="hidden truncate text-sm font-medium sm:block">{title}</p>
      <div className="flex-1" />
      <form
        role="search"
        className="hidden lg:block"
        onSubmit={(e) => {
          e.preventDefault();
          const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
          router.push(q ? `/courses?q=${encodeURIComponent(q)}` : "/courses");
        }}
      >
        <InputGroup name="q" prefix={<Search className="h-4 w-4" />} placeholder="ค้นหาหลักสูตร…" aria-label="ค้นหาหลักสูตร" className="w-60" />
      </form>
      <ThemeCustomizer />
      <ThemeToggle />
      {user ? (
        <DropdownMenu
          align="end"
          trigger={
            <button type="button" aria-label="บัญชีของฉัน" className="rounded-full transition-[scale] hover:scale-105 active:scale-95">
              <Avatar name={user.name} size={32} />
            </button>
          }
          items={[
            { label: user.email, disabled: true },
            { label: "", separator: true },
            { label: "คอร์สของฉัน", icon: <BookOpen className="h-4 w-4" />, onSelect: () => router.push("/my-courses") },
            { label: "ใบรับรองของฉัน", icon: <Award className="h-4 w-4" />, onSelect: () => router.push("/certificates") },
            { label: "ตั้งค่าบัญชี", icon: <Settings className="h-4 w-4" />, onSelect: () => router.push("/me") },
            { label: "", separator: true },
            { label: "ออกจากระบบ", icon: <LogoutIcon />, destructive: true, onSelect: onSignOut },
          ]}
        />
      ) : (
        <Link href="/login" className={buttonClass("default", "sm", "ml-1")}>
          เข้าสู่ระบบ
        </Link>
      )}
    </>
  );
}
