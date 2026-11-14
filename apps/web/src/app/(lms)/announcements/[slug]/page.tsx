import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { Alert, Badge, Card, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { RichText } from "@/components/programs/RichText";
import { ANNOUNCEMENT_KIND, formatDateRangeTh, formatDateTh, formatDateTimeTh } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getAnnouncementForViewer } from "@/server/programs/announcements.service";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = await getAnnouncementForViewer(slug, null);
  if (!a) return {};
  const description = a.summary ?? a.body.slice(0, 160);
  return { title: a.title, description, openGraph: { title: a.title, description, type: "article" } };
}

export default async function AnnouncementPage({ params }: Props) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const a = await getAnnouncementForViewer(slug, user);
  if (!a) notFound();
  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href="/announcements" className="transition-colors hover:text-foreground">ประกาศและกิจกรรม</Link>
            <ChevronRight className="h-3.5 w-3.5" /> {ANNOUNCEMENT_KIND[a.kind] ?? a.kind}
          </span>
        }
        title={a.title}
        description={`เผยแพร่ ${formatDateTh(a.publish_at, "long")}`}
      />
      {!a.is_live && (
        <div className="mb-4">
          <Alert variant="warning" title="ตัวอย่างสำหรับผู้ดูแล">ประกาศนี้ยังไม่แสดงต่อสาธารณะ (ฉบับร่าง ยังไม่ถึงเวลาเผยแพร่ หรือหมดอายุแล้ว)</Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-6 text-sm">
          {a.summary && <p className="mb-4 text-base text-muted-foreground">{a.summary}</p>}
          <RichText text={a.body} />
        </Card>
        {(a.event_starts_at || a.location || a.program_slug) && (
          <aside className="grid content-start gap-4">
            <Card className="grid gap-3 p-5 text-sm">
              <Badge variant="success" className="w-fit">{ANNOUNCEMENT_KIND[a.kind] ?? a.kind}</Badge>
              {a.event_starts_at && (
                <p className="flex gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> {a.event_ends_at ? formatDateRangeTh(a.event_starts_at, a.event_ends_at) : formatDateTimeTh(a.event_starts_at)}</p>
              )}
              {a.location && <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> {a.location}</p>}
              {a.program_slug && (
                <Link href={`/programs/${a.program_slug}`} className={buttonClass("default", "md", "w-full")}>
                  ดูหลักสูตร {a.program_title} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
