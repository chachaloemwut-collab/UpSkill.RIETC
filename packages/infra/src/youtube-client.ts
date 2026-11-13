// YouTube Data API v3 client (server only). Restrict the key in Google Cloud Console:
//   Application restriction = IP addresses (server egress IP), API restriction = YouTube Data API v3 only
import { validateYouTubeVideo, type VideoValidation, type YouTubeVideoItem } from "@upskill/core/youtube";

const ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";

/** Fetch up to 50 ids per call (costs 1 quota unit per call) */
export async function fetchVideos(apiKey: string, ids: readonly string[]): Promise<Map<string, VideoValidation>> {
  if (ids.length === 0 || ids.length > 50) throw new Error("ids must be 1..50");
  const url = new URL(ENDPOINT);
  url.searchParams.set("part", "snippet,contentDetails,status");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
  if (!res.ok) {
    // Never log the url (it contains the key)
    throw new Error(`YouTube API error: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { items?: YouTubeVideoItem[] };
  const byId = new Map((body.items ?? []).map((i) => [i.id, i]));
  return new Map(ids.map((id) => [id, validateYouTubeVideo(byId.get(id))]));
}
