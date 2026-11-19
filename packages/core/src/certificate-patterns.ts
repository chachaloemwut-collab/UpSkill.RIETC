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
