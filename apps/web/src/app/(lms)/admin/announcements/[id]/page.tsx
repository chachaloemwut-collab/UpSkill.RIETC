import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Alert, Badge, Card, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { AnnouncementActions, AnnouncementForm } from "@/components/admin/programs/AnnouncementForm";
import { formatDateTimeTh } from "@/lib/format";
import { ctx } from "@/server/context";
import { getAnnouncementForAdmin } from "@/server/programs/announcements.service";
import { or404, requireAdminPage, uuidOr404 } from "@/server/programs/admin-page";

export const metadata: Metadata = { title: "แก้ไขประกาศ", robots: { index: false } };

const VIS: Record<string, { label: string; variant: "secondary" | "success" | "outline" }> = {
  draft: { label: "ฉบับร่าง", variant: "secondary" },
  published: { label: "เผยแพร่", variant: "success" },
  archived: { label: "เก็บเข้าคลัง", variant: "outline" },
};

export default async function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const id = uuidOr404((await params).id);
  const a = await or404(getAnnouncementForAdmin(user, id));
  const programs = await ctx().db.selectFrom("programs").select(["id", "title"]).where("visibility", "<>", "archived").orderBy("title").execute();
  const vis = VIS[a.visibility];
  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Link href="/admin/announcements" className="hover:text-foreground">ประกาศ</Link><ChevronRight className="h-3.5 w-3.5" /> แก้ไข</span>}
        title={<span className="flex flex-wrap items-center gap-3">{a.title}<Badge variant={vis?.variant ?? "secondary"}>{vis?.label ?? a.visibility}</Badge></span>}
      >
        <Link href={`/announcements/${a.slug}`} className={buttonClass("outline")}><ExternalLink className="h-4 w-4" /> ดูตัวอย่าง</Link>
        <AnnouncementActions id={a.id} visibility={a.visibility} broadcastAt={a.broadcast_at} />
      </PageHeader>
      {a.broadcast_at && <div className="mb-4"><Alert variant="success" title={`ส่งอีเมลประชาสัมพันธ์แล้วเมื่อ ${formatDateTimeTh(a.broadcast_at)}`} /></div>}
      <Card className="p-5">
        <AnnouncementForm programs={programs} defaults={a} />
      </Card>
    </>
  );
}
