"use client";
import { BrandSignal } from "@/components/brand/BrandActivity";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Award, BookOpen, CalendarRange, FileSpreadsheet, GraduationCap, LayoutDashboard, Library, LogIn, Megaphone, Presentation, Search, Settings, ShieldAlert, ShieldCheck, Sun, Moon, UserPlus, UsersRound,
} from "lucide-react";
import {
  AppShell, Avatar, Button, CommandPalette, DropdownMenu, Kbd, LogoutIcon, MenuToggleIcon, ThemeCustomizer, ThemeToggle, buttonClass, useActionScene, useHotkey, useThemeSettings, useToast,
  type CommandItem, type ShellNavGroup,
} from "@/components/ui";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";
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
              { id: "/certificates", href: "/certificates", label: "วุฒิบัตรของฉัน", icon: <Award /> },
            ]
          : []),
        { id: "/verify", href: "/verify", label: "ตรวจสอบวุฒิบัตร", icon: <ShieldCheck /> },
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
        { id: "/admin/users", href: "/admin/users", label: "จัดการสมาชิก", icon: <UsersRound /> },
        { id: "/admin/certificates", href: "/admin/certificates", label: "จัดการวุฒิบัตร", icon: <Award /> },
        { id: "/admin/reports", href: "/admin/reports", label: "รายงานผู้อบรม", icon: <FileSpreadsheet /> },
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

function getBreadcrumbs(pathname: string, navTitle: string): { label: string; href?: string }[] {
  if (pathname === "/") return [{ label: "หน้าแรก" }];
  if (pathname === "/courses") return [{ label: "คลังหลักสูตร" }];
  if (pathname.startsWith("/courses/")) {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 2) {
      return [{ label: "คลังหลักสูตร", href: "/courses" }, { label: "รายละเอียดหลักสูตร" }];
    }
    if (parts.length >= 3 && parts[2] === "lessons") {
      return [{ label: "คลังหลักสูตร", href: "/courses" }, { label: "ห้องเรียนวิดีโอ" }];
    }
  }
  if (pathname === "/my-courses") return [{ label: "คอร์สของฉัน" }];
  if (pathname === "/certificates") return [{ label: "วุฒิบัตรของฉัน" }];
  if (pathname === "/verify") return [{ label: "ตรวจสอบวุฒิบัตร" }];
  if (pathname.startsWith("/verify/")) return [{ label: "ตรวจสอบวุฒิบัตร", href: "/verify" }, { label: "ผลการตรวจสอบ" }];
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin") return [{ label: "ผู้ดูแลระบบ", href: "/admin" }, { label: "ภาพรวม" }];
    if (pathname === "/admin/users") return [{ label: "ผู้ดูแลระบบ", href: "/admin" }, { label: "จัดการสมาชิก" }];
    if (pathname.startsWith("/admin/users/")) return [{ label: "ผู้ดูแลระบบ", href: "/admin" }, { label: "จัดการสมาชิก", href: "/admin/users" }, { label: "รายละเอียดสมาชิก" }];
    if (pathname === "/admin/certificates") return [{ label: "ผู้ดูแลระบบ", href: "/admin" }, { label: "จัดการวุฒิบัตร" }];
    if (pathname === "/admin/reports") return [{ label: "ผู้ดูแลระบบ", href: "/admin" }, { label: "รายงานผู้อบรม" }];
    if (pathname === "/admin/programs") return [{ label: "ผู้ดูแลระบบ", href: "/admin" }, { label: "หลักสูตรและรอบอบรม" }];
    if (pathname === "/admin/announcements") return [{ label: "ผู้ดูแลระบบ", href: "/admin" }, { label: "ประกาศประชาสัมพันธ์" }];
    return [{ label: "ผู้ดูแลระบบ", href: "/admin" }, { label: navTitle }];
  }
  if (pathname.startsWith("/instructor")) return [{ label: "ผู้สอน", href: "/instructor" }, { label: "จัดการหลักสูตร" }];
  if (pathname === "/assignments") return [{ label: "ผู้สอน", href: "/instructor" }, { label: "มอบหมายหลักสูตร" }];
  if (pathname === "/me") return [{ label: "บัญชี", href: "/me" }, { label: "ตั้งค่าบัญชี" }];
  return [{ label: navTitle }];
}

export function LmsShell({ user, children }: { user: ShellUser | null; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [scene, runScene] = useActionScene();
  const { settings, setDark } = useThemeSettings();
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useHotkey("k", () => setCommandOpen(true));

  const nav = useMemo(() => buildNav(user), [user]);
  const active = activeId(nav, pathname);
  const title = nav.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? "UpskillReskill.RIETC";
  const breadcrumbs = useMemo(() => getBreadcrumbs(pathname, title), [pathname, title]);

  const signOut = useCallback(async () => {
    const done = api("/api/auth/logout", { method: "POST" });
    await runScene({ icon: <BrandSignal state="logout" full />, title: "กำลังออกจากระบบ" }, 1200);
    const result = await done;
    if (!result.ok) {
      toast({ title: "ออกจากระบบไม่สำเร็จ", description: result.message, variant: "destructive" });
      return;
    }
    router.push("/");
    router.refresh();
    toast({ title: "ออกจากระบบแล้ว", variant: "success" });
  }, [runScene, router, toast]);

  const commandItems = useMemo<CommandItem[]>(() => [
    // Navigation
    { id: "nav-dash", label: user ? "แดชบอร์ด" : "หน้าแรก", group: "นำทางด่วน", icon: <LayoutDashboard className="h-4 w-4" />, onSelect: () => router.push("/") },
    { id: "nav-catalog", label: "คลังหลักสูตร", group: "นำทางด่วน", icon: <Library className="h-4 w-4" />, onSelect: () => router.push("/courses") },
    { id: "nav-programs", label: "หลักสูตรอบรม", group: "นำทางด่วน", icon: <GraduationCap className="h-4 w-4" />, onSelect: () => router.push("/programs") },
    { id: "nav-announcements", label: "ประกาศและกิจกรรม", group: "นำทางด่วน", icon: <Megaphone className="h-4 w-4" />, onSelect: () => router.push("/announcements") },
    ...(user ? [
      { id: "nav-my-courses", label: "คอร์สของฉัน", group: "นำทางด่วน", icon: <BookOpen className="h-4 w-4" />, onSelect: () => router.push("/my-courses") },
      { id: "nav-certs", label: "วุฒิบัตรของฉัน", group: "นำทางด่วน", icon: <Award className="h-4 w-4" />, onSelect: () => router.push("/certificates") },
    ] : []),
    { id: "nav-verify", label: "ตรวจสอบวุฒิบัตร", group: "นำทางด่วน", icon: <ShieldCheck className="h-4 w-4" />, onSelect: () => router.push("/verify") },

    // Quick Commands
    { id: "cmd-toggle-theme", label: `สลับเป็นโหมด${settings.dark ? "สว่าง" : "มืด"}`, group: "คำสั่งด่วน", icon: settings.dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />, onSelect: () => setDark(!settings.dark) },
    ...(user ? [
      { id: "cmd-me", label: "ตั้งค่าบัญชีของฉัน", group: "คำสั่งด่วน", icon: <Settings className="h-4 w-4" />, onSelect: () => router.push("/me") },
    ] : []),

    // Instructor
    ...(user && (user.role === "instructor" || user.role === "admin") ? [
      { id: "ins-courses", label: "จัดการหลักสูตร (ผู้สอน)", group: "สำหรับผู้สอน", icon: <Presentation className="h-4 w-4" />, onSelect: () => router.push("/instructor") },
      { id: "ins-assign", label: "มอบหมายหลักสูตรให้ผู้เรียน", group: "สำหรับผู้สอน", icon: <UsersRound className="h-4 w-4" />, onSelect: () => router.push("/assignments") },
    ] : []),

    // Admin
    ...(user?.role === "admin" ? [
      { id: "adm-overview", label: "ภาพรวมระบบ (แอดมิน)", group: "สำหรับผู้ดูแลระบบ", icon: <ShieldAlert className="h-4 w-4" />, onSelect: () => router.push("/admin") },
      { id: "adm-users", label: "จัดการสมาชิก (ค้นหา/สิทธิ์/ปลดล็อกชื่อ)", group: "สำหรับผู้ดูแลระบบ", icon: <UsersRound className="h-4 w-4" />, onSelect: () => router.push("/admin/users") },
      { id: "adm-certificates", label: "จัดการวุฒิบัตร (ค้นหา/เพิกถอน/ออก)", group: "สำหรับผู้ดูแลระบบ", icon: <Award className="h-4 w-4" />, onSelect: () => router.push("/admin/certificates") },
      { id: "adm-reports", label: "รายงานผู้อบรม (ตาราง/Excel/ภาพ)", group: "สำหรับผู้ดูแลระบบ", icon: <FileSpreadsheet className="h-4 w-4" />, onSelect: () => router.push("/admin/reports") },
      { id: "adm-programs", label: "หลักสูตรและรอบอบรม", group: "สำหรับผู้ดูแลระบบ", icon: <CalendarRange className="h-4 w-4" />, onSelect: () => router.push("/admin/programs") },
      { id: "adm-announcements", label: "จัดการประกาศประชาสัมพันธ์", group: "สำหรับผู้ดูแลระบบ", icon: <Megaphone className="h-4 w-4" />, onSelect: () => router.push("/admin/announcements") },
    ] : []),
  ], [user, settings.dark, setDark, router]);

  // Hide mobile bottom nav on video classrooms and exam pages
  const hideBottomNav = pathname.includes("/lessons/") || pathname.includes("/assessments/") || pathname.includes("/quiz");

  const brand = <BrandLogo mode="unfold" />;

  return (
    <>
      {scene}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        items={commandItems}
        placeholder="ค้นหาหน้า เมนู หรือพิมพ์คำสั่ง (Cmd+K)…"
        emptyText="ไม่พบผลลัพธ์ที่ค้นหา"
      />
      <AppShell
        brand={brand}
        brandIcon={<BrandLogo mode="mark" className="mx-auto" />}
        nav={nav}
        active={active}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        header={<TopBar title={title} breadcrumbs={breadcrumbs} user={user} onSignOut={signOut} onOpenCommand={() => setCommandOpen(true)} />}
        bottomBar={
          !hideBottomNav ? (
            <nav
              data-app-dock aria-label="เมนูหลักสำหรับมือถือ"
              className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-background/95 px-2 py-1.5 backdrop-blur-md pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden"
            >
              <Link
                href="/"
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[10px] text-muted-foreground transition hover:text-foreground",
                  pathname === "/" && "font-semibold text-primary"
                )}
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>{user ? "แดชบอร์ด" : "หน้าแรก"}</span>
              </Link>
              <Link
                href="/courses"
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[10px] text-muted-foreground transition hover:text-foreground",
                  pathname.startsWith("/courses") && "font-semibold text-primary"
                )}
              >
                <Library className="h-4 w-4" />
                <span>คลังคอร์ส</span>
              </Link>
              <Link
                href={user ? "/my-courses" : "/login"}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[10px] text-muted-foreground transition hover:text-foreground",
                  pathname === "/my-courses" && "font-semibold text-primary"
                )}
              >
                <BookOpen className="h-4 w-4" />
                <span>คอร์สฉัน</span>
              </Link>
              <Link
                href={user ? "/me" : "/verify"}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[10px] text-muted-foreground transition hover:text-foreground",
                  (pathname.startsWith("/me") || pathname.startsWith("/verify")) && "font-semibold text-primary"
                )}
              >
                {user ? <Settings className="h-4 w-4" /> : <Award className="h-4 w-4" />}
                <span>{user ? "บัญชี" : "ตรวจสอบ"}</span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[10px] text-muted-foreground transition hover:text-foreground"
              >
                <MenuToggleIcon open={mobileOpen} />
                <span>เพิ่มเติม</span>
              </button>
            </nav>
          ) : null
        }
        sidebarFooter={(collapsed) =>
          user ? (
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size={32} />
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 animate-fade-in text-sm">
                    <p className="truncate font-medium">{user.name}</p>
                    <div className="mt-0.5 flex items-center">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {ROLE_LABEL[user.role]}
                      </span>
                    </div>
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
        <div key={pathname} className={cn("mx-auto max-w-7xl animate-slide-up", !hideBottomNav && "pb-16 md:pb-0")}>
          {children}
        </div>
      </AppShell>
    </>
  );
}

function TopBar({
  breadcrumbs,
  user,
  onSignOut,
  onOpenCommand,
}: {
  title: string;
  breadcrumbs: { label: string; href?: string }[];
  user: ShellUser | null;
  onSignOut: () => void;
  onOpenCommand: () => void;
}) {
  const router = useRouter();
  return (
    <>
      {/* The phone toolbar reserves space for its actions with the square UR mark. */}
      <BrandLogo mode="mark" className="md:hidden" />
      <nav aria-label="เส้นทางหน้า" className="hidden min-w-0 lg:flex items-center gap-1.5 text-xs text-muted-foreground">
        {breadcrumbs.map((b, i) => {
          const isLast = i === breadcrumbs.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="opacity-40">/</span>}
              {b.href && !isLast ? (
                <Link href={b.href} className="transition hover:text-foreground">
                  {b.label}
                </Link>
              ) : (
                <span className={cn(isLast && "font-semibold text-foreground")}>{b.label}</span>
              )}
            </span>
          );
        })}
      </nav>
      <div className="flex-1" />

      {/* Global Command / Search Trigger */}
      <button
        type="button"
        onClick={onOpenCommand}
        aria-label="ค้นหาหรือพิมพ์คำสั่ง (Cmd+K)"
        className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-background/60 text-xs sm:h-9 sm:w-auto sm:justify-start sm:px-2.5 text-muted-foreground transition hover:border-foreground/30 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-56"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left hidden lg:inline truncate">ค้นหาหรือพิมพ์คำสั่ง…</span>
        <span className="hidden flex-1 truncate text-left sm:inline lg:hidden">ค้นหา…</span>
        <Kbd className="hidden lg:inline-flex text-[10px]">⌘K</Kbd>
      </button>

      <span className="hidden sm:contents">
        <ThemeCustomizer />
      </span>
      <ThemeToggle />
      {user ? (
        <DropdownMenu
          align="end"
          trigger={
            <button type="button" aria-label="บัญชีของฉัน" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-[scale] hover:scale-105 active:scale-95">
              <Avatar name={user.name} size={32} />
            </button>
          }
          items={[
            { label: user.email, disabled: true },
            { label: "", separator: true },
            { label: "คอร์สของฉัน", icon: <BookOpen className="h-4 w-4" />, onSelect: () => router.push("/my-courses") },
            { label: "วุฒิบัตรของฉัน", icon: <Award className="h-4 w-4" />, onSelect: () => router.push("/certificates") },
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
