import { BrandSignal } from "@/components/brand/BrandActivity";
import Link from "next/link";
import { CalendarDays, MapPin, Pin } from "lucide-react";
import { Badge } from "@/components/ui";
import { ANNOUNCEMENT_KIND, formatDateRangeTh, formatDateTh } from "@/lib/format";

export interface AnnouncementCardData {
  slug: string;
  title: string;
  summary: string | null;
  kind: string;
  location: string | null;
  event_starts_at: Date | null;
  event_ends_at: Date | null;
  publish_at: Date;
  is_pinned: boolean;
}

export function AnnouncementCard({ a, latest = false }: { a: AnnouncementCardData; latest?: boolean }) {
  return (
    <Link href={`/announcements/${a.slug}`} className="group flex flex-col gap-2 rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={a.kind === "event" ? "success" : a.kind === "notice" ? "warning" : "secondary"}>{ANNOUNCEMENT_KIND[a.kind] ?? a.kind}</Badge>
        {latest && <span className="inline-flex items-center gap-1"><BrandSignal state="notification" /> ประกาศล่าสุด</span>}
        {a.is_pinned && <span className="inline-flex items-center gap-1"><Pin className="h-3 w-3" /> ปักหมุด</span>}
        <span className="ml-auto">{formatDateTh(a.publish_at)}</span>
      </div>
      <h3 className="line-clamp-2 font-semibold leading-snug group-hover:underline">{a.title}</h3>
      {a.summary && <p className="line-clamp-2 text-sm text-muted-foreground">{a.summary}</p>}
      {(a.event_starts_at || a.location) && (
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
          {a.event_starts_at && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {formatDateRangeTh(a.event_starts_at, a.event_ends_at)}</span>}
          {a.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {a.location}</span>}
        </div>
      )}
    </Link>
  );
}
