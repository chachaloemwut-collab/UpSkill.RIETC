import { describe, expect, it } from "vitest";
import { extractYouTubeVideoId, parseIsoDuration, validateYouTubeVideo } from "./youtube.ts";

describe("extractYouTubeVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("%s", (url, id) => expect(extractYouTubeVideoId(url)).toBe(id));

  it.each([
    "https://youtube.com.evil.tld/watch?v=dQw4w9WgXcQ",
    "https://evil.tld/?u=youtube.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ'onerror",
  ])("rejects %s", (url) => expect(extractYouTubeVideoId(url)).toBeNull());
});

describe("parseIsoDuration", () => {
  it.each([
    ["PT15M33S", 933],
    ["PT1H", 3600],
    ["PT45S", 45],
    ["P1DT2H", 93600],
  ])("%s -> %d", (iso, sec) => expect(parseIsoDuration(iso)).toBe(sec));
  it.each(["", "P", "PT", "15M", "PTXS"])("rejects %s", (iso) => expect(parseIsoDuration(iso)).toBeNull());
});

describe("validateYouTubeVideo", () => {
  const base = {
    id: "dQw4w9WgXcQ",
    snippet: { title: "t", liveBroadcastContent: "none" },
    contentDetails: { duration: "PT10M" },
    status: { embeddable: true, privacyStatus: "public", uploadStatus: "processed" },
  };
  it("accepts a normal public video", () => expect(validateYouTubeVideo(base)).toMatchObject({ ok: true, durationSec: 600, isPublic: true }));
  it("accepts an unlisted video with isPublic false", () =>
    expect(validateYouTubeVideo({ ...base, status: { ...base.status, privacyStatus: "unlisted" } })).toMatchObject({ ok: true, durationSec: 600, isPublic: false }));
  it("rejects non-embeddable", () =>
    expect(validateYouTubeVideo({ ...base, status: { ...base.status, embeddable: false } })).toMatchObject({ reason: "NOT_EMBEDDABLE" }));
  it("rejects private", () =>
    expect(validateYouTubeVideo({ ...base, status: { ...base.status, privacyStatus: "private" } })).toMatchObject({ reason: "NOT_PUBLIC" }));
  it("rejects live", () =>
    expect(validateYouTubeVideo({ ...base, snippet: { liveBroadcastContent: "live" } })).toMatchObject({ reason: "LIVE_OR_UPCOMING" }));
  it("rejects missing", () => expect(validateYouTubeVideo(undefined)).toMatchObject({ reason: "NOT_FOUND" }));
});
