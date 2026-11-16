import type { Metadata } from "next";
import Link from "next/link";
import { Search, UserCog, Download } from "lucide-react";
import { Badge, Card, Input, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { ROLE_LABEL, formatDateTh } from "@/lib/format";
import { listUsersAdmin } from "@/server/admin/users.service";
import { requireAdminPage } from "@/server/programs/admin-page";

export const metadata: Metadata = { title: "จัดการสมาชิก", robots: { index: false } };

const STATUS_LABEL: Record<string, { label: string; variant: "secondary" | "success" | "warning" | "destructive" }> = {
  active: { label: "ใช้งาน", variant: "success" },
  suspended: { label: "ระงับชั่วคราว", variant: "warning" },
  banned: { label: "ระงับถาวร", variant: "destructive" },
};

/** Page-number window around the current page (1 … 4 5 [6] 7 8 … 42). */
function pageNumbers(current: number, total: number): number[] {
  const window = 2;
  const start = Math.max(1, current - window);
  const end = Math.min(total, current + window);
  const nums: number[] = [];
  for (let p = start; p <= end; p++) nums.push(p);
  if (nums[0]! > 1) nums.unshift(1);
  if (nums[nums.length - 1]! < total) nums.push(total);
  return nums;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const data = await listUsersAdmin({ query: sp.q, role: sp.role, status: sp.status, page: Number(sp.page ?? 1) });
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const pageLink = (p: number) =>
    `/admin/users?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.role ? { role: sp.role } : {}), ...(sp.status ? { status: sp.status } : {}), page: String(p) }).toString()}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="จัดการสมาชิก" description={`สมาชิกทั้งหมด ${data.total} คน · ค้นหา กรอง เปลี่ยนบทบาท/สถานะ ดูประวัติอย่างละเอียด`} />

      <Card className="mb-4 p-4">
        <form action="/admin/users" method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="ค้นหาอีเมลหรือชื่อ…" className="w-full pl-9" />
          </div>
          <select name="role" defaultValue={sp.role ?? ""} className="h-10 rounded-lg border bg-background px-3 text-sm">
            <option value="">ทุกบทบาท</option>
            <option value="member">ผู้เรียน</option>
            <option value="instructor">ผู้สอน</option>
            <option value="admin">ผู้ดูแลระบบ</option>
          </select>
          <select name="status" defaultValue={sp.status ?? ""} className="h-10 rounded-lg border bg-background px-3 text-sm">
            <option value="">ทุกสถานะ</option>
            <option value="active">ใช้งาน</option>
            <option value="suspended">ระงับชั่วคราว</option>
            <option value="banned">ระงับถาวร</option>
          </select>
          <button type="submit" className={buttonClass("default", "md")}>ค้นหา</button>
          <Link
            href={`/api/admin/users/export?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.role ? { role: sp.role } : {}), ...(sp.status ? { status: sp.status } : {}) }).toString()}`}
            className={buttonClass("outline", "md")}
            title="ดาวน์โหลดสมาชิกที่ตรงเงื่อนไขทั้งหมดเป็น CSV"
          >
            <Download className="h-4 w-4" /> ส่งออก CSV
          </Link>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3">สมาชิก</th>
              <th className="px-4 py-3">บทบาท</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3 text-right">ลงทะเบียน</th>
              <th className="px-4 py-3 text-right">ใบรับรอง</th>
              <th className="px-4 py-3">สมัครเมื่อ</th>
              <th className="px-4 py-3 text-right">ใช้งานล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">
                    {u.legal_full_name_th ?? u.legal_full_name_en ?? u.username ?? u.email}
                  </Link>
                  <p className="text-xs text-muted-foreground">{u.email}{u.deleted_at ? " · ลบบัญชีแล้ว" : ""}</p>
                </td>
                <td className="px-4 py-3"><Badge variant="secondary">{ROLE_LABEL[u.role] ?? u.role}</Badge></td>
                <td className="px-4 py-3">
                  <Badge variant={u.deleted_at ? "destructive" : (STATUS_LABEL[u.status]?.variant ?? "secondary")}>
                    {u.deleted_at ? "ลบบัญชีแล้ว" : (STATUS_LABEL[u.status]?.label ?? u.status)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">{u.enrollments}</td>
                <td className="px-4 py-3 text-right">{u.certificates}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTh(u.created_at)}</td>
                <td className="px-4 py-3 text-right text-xs text-muted-foreground">{u.last_active_at ? formatDateTh(u.last_active_at) : "—"}</td>
              </tr>
            ))}
            {data.users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">ไม่พบสมาชิกที่ตรงเงื่อนไข</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
          <p className="text-muted-foreground">หน้า {data.page} / {totalPages} · {data.total} คน</p>
          <div className="flex flex-wrap items-center gap-1">
            {data.page > 1 && <Link href={pageLink(data.page - 1)} className={buttonClass("outline", "sm")}>‹ ก่อนหน้า</Link>}
            {pageNumbers(data.page, totalPages).map((p, i) =>
              p === data.page ? (
                <span key={i} className="inline-flex h-9 min-w-9 items-center justify-center rounded-md bg-primary px-2 text-sm font-semibold text-primary-foreground">{p}</span>
              ) : (
                <Link key={i} href={pageLink(p)} className={buttonClass("outline", "sm")}>{p}</Link>
              ),
            )}
            {data.page < totalPages && <Link href={pageLink(data.page + 1)} className={buttonClass("outline", "sm")}>ถัดไป ›</Link>}
          </div>
        </div>
      </Card>

      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <UserCog className="h-4 w-4" /> คลิกชื่อสมาชิกเพื่อดูรายละเอียดเต็ม: โปรไฟล์ การลงทะเบียน ใบรับรอง เซสชัน พฤติกรรม ประวัติอีเมล และ audit log
      </p>
    </div>
  );
}
