// Server-safe formatting helpers shared by pages and client components.

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} ชม. ${m} นาที` : `${m} นาที`;
}

/** Thumbnail from i.ytimg.com (already allowed by the CSP img-src for the player). */
export function youtubeThumb(videoId: string | null | undefined): string | null {
  return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

export function formatDateTh(d: Date | string, style: "long" | "medium" = "medium"): string {
  return new Date(d).toLocaleDateString("th-TH", { dateStyle: style, timeZone: "Asia/Bangkok" });
}

export function formatDateTimeTh(d: Date | string): string {
  return new Date(d).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
}

export const ROLE_LABEL: Record<string, string> = { member: "ผู้เรียน", instructor: "ผู้สอน", admin: "ผู้ดูแลระบบ" };

export const VISIBILITY: Record<string, { label: string; variant: "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "ฉบับร่าง", variant: "secondary" },
  published: { label: "เผยแพร่", variant: "success" },
  unlisted: { label: "เฉพาะผู้มีลิงก์", variant: "warning" },
  suspended: { label: "ถูกระงับ", variant: "destructive" },
  archived: { label: "ปิดหลักสูตร / เข้าคลัง", variant: "outline" },
  enrollment_closed: { label: "ปิดรับสมัครใหม่", variant: "warning" },
};

export function displayName(email: string): string {
  return email.split("@")[0] ?? email;
}

type BadgeVariant = "secondary" | "success" | "warning" | "destructive" | "outline" | "default";

export const PROGRAM_VISIBILITY: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "ฉบับร่าง", variant: "secondary" },
  published: { label: "เผยแพร่", variant: "success" },
  unlisted: { label: "เฉพาะผู้มีลิงก์", variant: "warning" },
  archived: { label: "เก็บเข้าคลัง", variant: "outline" },
};

export const COHORT_PHASE: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "ฉบับร่าง", variant: "secondary" },
  scheduled: { label: "เร็วๆ นี้", variant: "outline" },
  open: { label: "เปิดรับสมัคร", variant: "success" },
  closed: { label: "ปิดรับสมัคร", variant: "warning" },
  in_progress: { label: "กำลังอบรม", variant: "default" },
  completed: { label: "อบรมเสร็จสิ้น", variant: "secondary" },
  cancelled: { label: "ยกเลิก", variant: "destructive" },
};

export const REGISTRATION_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: "รอพิจารณา", variant: "warning" },
  approved: { label: "อนุมัติแล้ว", variant: "success" },
  rejected: { label: "ไม่อนุมัติ", variant: "destructive" },
  waitlisted: { label: "รายชื่อสำรอง", variant: "outline" },
  cancelled: { label: "ยกเลิกแล้ว", variant: "secondary" },
};

export const ANNOUNCEMENT_KIND: Record<string, string> = { event: "กิจกรรม", news: "ข่าวสาร", notice: "ประกาศ" };

export function formatDateRangeTh(start: Date | string, end?: Date | string | null): string {
  const a = formatDateTh(start, "long");
  if (!end) return a;
  const b = formatDateTh(end, "long");
  return a === b ? a : `${a} – ${b}`;
}

/** A Date as the value of <input type="datetime-local"> in Bangkok time (UTC+7, no DST) */
export function toBangkokInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const t = new Date(new Date(d).getTime() + 7 * 3600_000);
  return t.toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value, read as Bangkok time, to an ISO string with offset (null when empty) */
export function fromBangkokInput(v: FormDataEntryValue | string | null | undefined): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00+07:00` : null;
}
