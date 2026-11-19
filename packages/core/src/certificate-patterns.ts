// Certificate colour patterns (courses.credential_template_key). Shared by the worker's PDF artwork and the
// course editor's live preview, so what an instructor picks is what the learner receives. Client-safe (no IO).

export interface CertificatePalette {
  /** Outer frame, rosette strokes, seal */
  frame: string;
  /** Secondary ornament line colour (guilloche band) */
  inner: string;
  /** Gold-like accent: dividers, inner rule, kicker */
  accent: string;
  title: string;
  ink: string;
  muted: string;
  bg: string;
  /** Guilloche band and corner rosettes; off for the minimal pattern */
  ornate: boolean;
}

export const CERTIFICATE_PATTERN_KEYS = ["standard", "classic", "royal", "minimal"] as const;
export type CertificatePatternKey = (typeof CERTIFICATE_PATTERN_KEYS)[number];

export const CERTIFICATE_PATTERNS: Record<CertificatePatternKey, CertificatePalette> = {
  standard: { frame: "#4a2a9c", inner: "#1590b3", accent: "#c4842c", title: "#3b1f86", ink: "#17152e", muted: "#5f5874", bg: "#fffcf6", ornate: true },
  classic: { frame: "#14532d", inner: "#2f7a4a", accent: "#ad8a39", title: "#14532d", ink: "#1c1917", muted: "#57534e", bg: "#fcfbf4", ornate: true },
  royal: { frame: "#1b2f6b", inner: "#3a5296", accent: "#b58d2e", title: "#1b2f6b", ink: "#1c1917", muted: "#57534e", bg: "#fffdf7", ornate: true },
  minimal: { frame: "#334155", inner: "#94a3b8", accent: "#64748b", title: "#0f172a", ink: "#1c1917", muted: "#57534e", bg: "#ffffff", ornate: false },
};

export function certificatePattern(key: string): CertificatePalette {
  return (CERTIFICATE_PATTERNS as Record<string, CertificatePalette>)[key] ?? CERTIFICATE_PATTERNS.standard;
}

const KICKERS: Record<string, string> = {
  completion: "Certificate of Completion",
  program: "Certificate of Training",
  development_test: "Development Test",
};

/** Small caps line above the document name, from the credential type code. */
export const certificateKicker = (type: string) => KICKERS[type] ?? `Certificate · ${type.replace(/_/g, " ")}`;

/**
 * Site-wide certificate layout options (system_settings key "certificate_display").
 * issuer_name: issuing body printed under the emblem (defaults to the college).
 * The signature block is per course (courses.credential_show_signer + an uploaded signature image).
 */
export interface CertificateDisplay {
  issuer_name: string;
}

/** The college that issues every document on this platform */
export const DEFAULT_ISSUER_TH = "วิทยาลัยเทคนิคนิคมอุตสาหกรรมระยอง";
export const DEFAULT_ISSUER_EN = "Rayong Industrial Estate Technical College";

export const CERTIFICATE_DISPLAY_DEFAULTS: CertificateDisplay = { issuer_name: DEFAULT_ISSUER_TH };

/** Tolerant parser for the stored JSON value (missing row or fields fall back to the defaults; unknown keys dropped). */
export function parseCertificateDisplay(value: unknown): CertificateDisplay {
  const v = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof CertificateDisplay, unknown>>;
  return {
    issuer_name: typeof v.issuer_name === "string" && v.issuer_name.trim() ? v.issuer_name.trim().slice(0, 160) : CERTIFICATE_DISPLAY_DEFAULTS.issuer_name,
  };
}

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
/** Arabic → Thai digits, the convention on formal Thai certificates. */
export const thaiDigits = (s: string) => s.replace(/[0-9]/g, (d) => THAI_DIGITS[Number(d)]!);

/** "๑๙ พฤศจิกายน พ.ศ. ๒๕๖๙" — the formal "ให้ไว้ ณ วันที่" date, Bangkok time. */
export function formalThaiDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year").replace(/[^0-9]/g, "");
  return thaiDigits(`${get("day")} ${get("month")} พ.ศ. ${year}`);
}
