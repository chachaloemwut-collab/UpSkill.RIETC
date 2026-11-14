import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { AnnouncementCard } from "@/components/programs/AnnouncementCard";
import { listPublicAnnouncements } from "@/server/programs/announcements.service";

export const metadata: Metadata = { title: "ประกาศและกิจกรรม", description: "ข่าวสาร กิจกรรม และประกาศรอบอบรม" };
export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const items = await listPublicAnnouncements();
  return (
    <>
      <PageHeader title="ประกาศและกิจกรรม" description="ข่าวสาร กิจกรรมที่กำลังจะเกิดขึ้น และประกาศรอบอบรม" />
      {items.length === 0 ? (
        <EmptyState icon={<Megaphone className="h-5 w-5" />} title="ยังไม่มีประกาศ" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => <AnnouncementCard key={a.id} a={a} />)}
        </div>
      )}
    </>
  );
}
