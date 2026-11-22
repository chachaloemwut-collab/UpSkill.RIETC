import Link from "next/link";
import { ArrowRight, Award, BookOpen, CalendarDays, ClipboardList, Library, LogIn, Settings, Users } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";

export function AppHome({ role, name }: { role?: string; name?: string }) {
  const tasks = [
    { href: role ? "/my-courses" : "/courses", title: role ? "หลักสูตรของฉัน" : "ค้นหาหลักสูตร", icon: BookOpen },
    { href: "/programs", title: "รอบอบรม", icon: CalendarDays },
    { href: role ? "/certificates" : "/verify", title: role ? "วุฒิบัตรของฉัน" : "ตรวจสอบวุฒิบัตร", icon: Award },
    { href: role ? "/me" : "/login", title: role ? "บัญชีของฉัน" : "เข้าสู่ระบบ", icon: role ? Settings : LogIn },
  ];
  return <section className="app-launcher">
    {!role && <BrandLogo />}
    <h1 className="mt-5 text-2xl font-semibold">{name || "ศูนย์อบรมวิทยาลัย"}</h1>
    <nav aria-label="งานหลัก" className="my-5 grid grid-cols-2 gap-3">{tasks.map(({ href, title, icon: Icon }) =>
      <Link key={href} href={href} className="grid min-h-24 content-between gap-3 rounded-xl border bg-card p-4 font-medium"><Icon className="size-5 text-primary"/>{title}</Link>)}</nav>
    <nav aria-label="บริการเพิ่มเติม" className="grid divide-y rounded-xl border bg-card px-4">
      {[
        { href: "/courses", title: "หลักสูตรทั้งหมด", icon: Library },
        { href: "/announcements", title: "ประกาศของวิทยาลัย", icon: ClipboardList },
        ...(!role ? [{ href: "/register", title: "สมัครสมาชิก", icon: Users }] : []),
        ...(role === "admin" ? [{ href: "/admin/users", title: "จัดการสมาชิก", icon: Users }] : []),
        ...(role === "instructor" || role === "admin" ? [{ href: "/instructor", title: "จัดการรายวิชา", icon: BookOpen }] : []),
      ].map(({href, title, icon: Icon}) => <Link key={href} href={href} className="flex min-h-12 items-center gap-3 text-sm"><Icon size={17}/>{title}<ArrowRight className="ml-auto" size={15}/></Link>)}
    </nav>
    {!role && <Link className="mt-5 inline-flex min-h-11 items-center text-sm text-primary underline" href="/?view=website">ดูหน้าเว็บไซต์เต็ม</Link>}
  </section>;
}
