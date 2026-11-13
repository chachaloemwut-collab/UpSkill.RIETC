/** YouTube URL parsing and validation (spec 5.3). The network call lives in @upskill/infra. */

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const ALLOWED_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com"]);

/** Strict host allowlist so links like `youtube.com.evil.tld/watch?v=` are not accepted. */
export function extractYouTubeVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return VIDEO_ID_RE.test(input.trim()) ? input.trim() : null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;

  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else {
    const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
    id = m?.[1] ?? null;
  }
  return id && VIDEO_ID_RE.test(id) ? id : null;
}

/** ISO 8601 duration (PT15M33S, P1DT2H, PT45S) -> seconds. Returns null if invalid. */
export function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m || iso === "P" || iso.endsWith("T")) return null;
  const [, d = "0", h = "0", min = "0", s = "0"] = m;
  return Number(d) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(s);
}

/** Shape of an item from videos.list?part=snippet,contentDetails,status (only the fields we use) */
export interface YouTubeVideoItem {
  id: string;
  snippet?: { title?: string; liveBroadcastContent?: string };
  contentDetails?: { duration?: string; contentRating?: { ytRating?: string } };
  status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string };
}

export type VideoValidation =
  | { ok: true; videoId: string; title: string; durationSec: number }
  | { ok: false; reason: "NOT_FOUND" | "NOT_EMBEDDABLE" | "NOT_PUBLIC" | "LIVE_OR_UPCOMING" | "AGE_RESTRICTED" | "NOT_PROCESSED" | "BAD_DURATION" };

export function validateYouTubeVideo(item: YouTubeVideoItem | undefined): VideoValidation {
  if (!item) return { ok: false, reason: "NOT_FOUND" };
  if (item.status?.embeddable !== true) return { ok: false, reason: "NOT_EMBEDDABLE" };
  if (item.status.privacyStatus !== "public" && item.status.privacyStatus !== "unlisted") return { ok: false, reason: "NOT_PUBLIC" };
  if (item.status.uploadStatus && item.status.uploadStatus !== "processed") return { ok: false, reason: "NOT_PROCESSED" };
  if ((item.snippet?.liveBroadcastContent ?? "none") !== "none") return { ok: false, reason: "LIVE_OR_UPCOMING" };
  // Age-restricted videos can't play in an embed (error 150) -> reject up front
  if (item.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") return { ok: false, reason: "AGE_RESTRICTED" };
  const durationSec = parseIsoDuration(item.contentDetails?.duration ?? "");
  if (!durationSec || durationSec <= 0) return { ok: false, reason: "BAD_DURATION" };
  return { ok: true, videoId: item.id, title: item.snippet?.title ?? "", durationSec };
}

/** IFrame Player error codes that mean "the video is gone / can't be embedded" (worth reporting to the server) */
export const REPORTABLE_PLAYER_ERRORS = new Set([100, 101, 150, 153]);
