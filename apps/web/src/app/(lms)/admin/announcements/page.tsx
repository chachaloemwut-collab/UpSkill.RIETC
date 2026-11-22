import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Mail, Megaphone, Pin, Plus } from "lucide-react";
import { Badge, Card, EmptyState, Table, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { ANNOUNCEMENT_KIND, formatDateTimeTh } from "@/lib/format";
import { listAnnouncementsAdmin } from "@/server/programs/announcements.service";
import { requireAdminPage } from "@/server/programs/admin-page";

export const metadata: Metadata = { title: "ประกาศประชาสัมพันธ์", robots: { index: false } };

const VIS: Record<string, { label: string; variant: "secondary" | "success" | "outline" }> = {
  draft: { label: "ฉบับร่าง", variant: "secondary" },
  published: { label: "เผยแพร่", variant: "success" },
  archived: { label: "เก็บเข้าคลัง", variant: "outline" },
};

export default async function AdminAnnouncementsPage() {
  const user = await requireAdminPage();
  return <Suspense fallback={<LoadingSkeleton label="กำลังโหลดประกาศ" />}><Announcements user={user} /></Suspense>;
}

async function Announcements({ user }: { user: NonNullable<Awaited<ReturnType<typeof requireAdminPage>>> }) {
  const items = await listAnnouncementsAdmin(user);
  const now = new Date();
  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Link href="/admin" className="hover:text-foreground">ผู้ดูแลระบบ</Link><ChevronRight className="h-3.5 w-3.5" /> ประกาศ</span>}
        title="ประกาศประชาสัมพันธ์"
        description="ประชาสัมพันธ์กิจกรรมและรอบอบรมบนหน้าเว็บ ตั้งเวลาเริ่ม-หยุดแสดง และส่งอีเมลถึงผู้ที่เปิดรับข่าวสาร"
      >
        <Link href="/admin/announcements/new" className={buttonClass("default")}><Plus className="h-4 w-4" /> เขียนประกาศ</Link>
      </PageHeader>
      <Card>
        {items.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Megaphone className="h-5 w-5" />} title="ยังไม่มีประกาศ" /></div>
        ) : (
          <div className="overflow-x-auto p-3">
            <Table className="[&_td]:py-2.5">
              <thead>
                <tr><th>หัวข้อ</th><th>ประเภท</th><th>สถานะ</th><th>แสดงตั้งแต่</th><th>หยุดแสดง</th><th>อีเมล</th></tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const vis = VIS[a.visibility];
                  const scheduled = a.visibility === "published" && a.publish_at > now;
                  const expired = !!a.expires_at && a.expires_at <= now;
                  return (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/admin/announcements/${a.id}`} className="inline-flex max-w-sm items-center gap-1.5 font-medium hover:underline">
                          {a.is_pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="ปักหมุด" />}
                          <span className="truncate">{a.title}</span>
                        </Link>
                        {a.program_title && <p className="text-xs text-muted-foreground">{a.program_title}</p>}
                      </td>
                      <td>{ANNOUNCEMENT_KIND[a.kind] ?? a.kind}</td>
                      <td className="space-x-1">
                        <Badge variant={vis?.variant ?? "secondary"}>{vis?.label ?? a.visibility}</Badge>
                        {scheduled && <Badge variant="warning">ตั้งเวลาไว้</Badge>}
                        {expired && <Badge variant="outline">หมดอายุ</Badge>}
                      </td>
                      <td className="whitespace-nowrap text-muted-foreground">{formatDateTimeTh(a.publish_at)}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{a.expires_at ? formatDateTimeTh(a.expires_at) : "—"}</td>
                      <td>{a.broadcast_at ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" /> ส่งแล้ว</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
