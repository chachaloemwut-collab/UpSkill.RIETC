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

export const VISIBILITY: Record<string, { label: string; variant: "secondary" | "success" | "warning" | "destructive" }> = {
  draft: { label: "ฉบับร่าง", variant: "secondary" },
  published: { label: "เผยแพร่", variant: "success" },
  unlisted: { label: "เฉพาะผู้มีลิงก์", variant: "warning" },
  suspended: { label: "ถูกระงับ", variant: "destructive" },
};

export function displayName(email: string): string {
  return email.split("@")[0] ?? email;
}
