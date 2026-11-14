import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { AnnouncementForm } from "@/components/admin/programs/AnnouncementForm";
import { ctx } from "@/server/context";
import { requireAdminPage } from "@/server/programs/admin-page";

export const metadata: Metadata = { title: "เขียนประกาศ", robots: { index: false } };

export default async function NewAnnouncementPage() {
  await requireAdminPage();
  const programs = await ctx().db.selectFrom("programs").select(["id", "title"]).where("visibility", "<>", "archived").orderBy("title").execute();
  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Link href="/admin/announcements" className="hover:text-foreground">ประกาศ</Link><ChevronRight className="h-3.5 w-3.5" /> เขียนประกาศ</span>}
        title="เขียนประกาศ"
        description="บันทึกเป็นฉบับร่างก่อน แล้วกดเผยแพร่เมื่อพร้อม"
      />
      <Card className="p-5">
        <AnnouncementForm
          programs={programs}
          defaults={{ title: "", summary: null, body: "", kind: "event", program_id: null, location: null, event_starts_at: null, event_ends_at: null, publish_at: null, expires_at: null, is_pinned: false }}
        />
      </Card>
    </>
  );
}
