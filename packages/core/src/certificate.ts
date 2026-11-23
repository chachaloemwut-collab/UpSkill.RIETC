/**
 * Certificate signing with Ed25519 (replaces the spec's HMAC-SHA256).
 *
 * Why not HMAC:
 *  - HMAC uses one shared secret for both sign and verify -> anyone holding the verification key can forge
 *  - the key can never be rotated (the spec itself says "never change this key")
 *  - third parties cannot verify offline
 * Ed25519 + kid: rotate by adding a new key; old public keys are kept forever.
 *
 * We store `signedPayload` (the exact signed string) instead of rebuilding it from DB columns at verify time,
 * because rebuilding risks precision bugs (e.g. Postgres timestamps are microseconds but JS Date is milliseconds)
 * and delimiter injection (names containing "|"). At verify time, check the signature first,
 * then compare every field in the payload against the DB columns (catches direct DB edits).
 */
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from "node:crypto";

interface CertificatePayloadBase {
  code: string;
  enrollmentId: string;
  userId: string;
  courseId: string;
  recipientName: string;
  courseTitle: string;
  instructorName: string;
  totalStudySec: number;
  /** Decimal as a string (e.g. "92.50") to avoid float serialization issues */
  quizScore: string;
  verifiedCourse: boolean;
  /** ISO-8601 UTC, millisecond precision. Store the same value in certificates.issued_at */
  issuedAt: string;
}

export interface CertificatePayloadV1 extends CertificatePayloadBase { v: 1 }
export interface CertificatePayloadV2 extends CertificatePayloadBase {
  v: 2;
  documentName: string;
  documentType: string;
  expiresAt: string | null;
}
export interface CertificatePayloadV3 extends CertificatePayloadBase {
  v: 3;
  documentName: string;
  documentType: string;
  expiresAt: string | null;
  signerTitle: string | null;
  achievement: string | null;
  /** Short anti-forgery fingerprint printed on the paper and shown on the verify page */
  visualDigest: string;
}
export interface CertificatePayloadV4 extends Omit<CertificatePayloadBase, "enrollmentId" | "courseId"> {
  v: 4;
  documentName: string;
  documentType: string;
  expiresAt: string | null;
  signerTitle: string | null;
  achievement: string | null;
  visualDigest: string;
  /** null for program-level certificates (which span several enrollments) */
  enrollmentId: string | null;
  courseId: string | null;
  programId: string;
  cohortId: string;
}
export type CertificatePayload = CertificatePayloadV1 | CertificatePayloadV2 | CertificatePayloadV3 | CertificatePayloadV4;
export type CertificateRecord = Omit<CertificatePayloadV1, "v" | "enrollmentId" | "courseId"> & Partial<Pick<CertificatePayloadV2, "documentName" | "documentType" | "expiresAt">> & Partial<Pick<CertificatePayloadV3, "signerTitle" | "achievement" | "visualDigest">> & { enrollmentId: string | null; courseId: string | null; programId?: string | null; cohortId?: string | null };

/** 12 hex chars of SHA-256 over the visually-compared identity fields (paper vs online). */
export function computeVisualDigest(recipientName: string, courseTitle: string, code: string): string {
  return createHash("sha256").update(`${recipientName}\n${courseTitle}\n${code}`).digest("hex").slice(0, 12);
}

export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const DEVELOPER_TEST_EMAIL = "cha.chaloemwut@gmail.com";
export const DEVELOPER_TEST_DOCUMENT_TYPE = "development_test";

export function isDeveloperTestEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === DEVELOPER_TEST_EMAIL;
}

export function isDeveloperTestCertificate(documentType: string | null | undefined): boolean {
  return documentType === DEVELOPER_TEST_DOCUMENT_TYPE;
}

/** CERT-2026-XXXX-XXXX-XXXX : 60 bits (spec used 32 bits = easy to enumerate the public verify page) */
export function generateCertificateCode(year: number): string {
  const bytes = randomBytes(8);
  let n = bytes.readBigUInt64BE() >> 4n; // 60 bits
  let s = "";
  for (let i = 0; i < 12; i++) {
    s = CROCKFORD.charAt(Number(n & 31n)) + s;
    n >>= 5n;
  }
  return `CERT-${year}-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export const CERTIFICATE_CODE_RE = /^CERT-\d{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** Normalize Unicode for names (Thai vowel/tone marks can have more than one code point sequence) */
export function normalizeName(name: string): string {
  return name.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Canonical JSON: keys sorted recursively, no whitespace. Accepts only string/int/bool/object/array. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("canonicalJson: only safe integers are allowed");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new Error(`canonicalJson: unsupported type ${typeof value}`);
}

export interface SignedCertificate {
  signedPayload: string;
  signature: string; // base64url
  keyId: string;
}

export function signCertificate(payload: CertificatePayload, keyId: string, privateKeyPkcs8B64u: string): SignedCertificate {
  const key = createPrivateKey({ key: Buffer.from(privateKeyPkcs8B64u, "base64url"), format: "der", type: "pkcs8" });
  const signedPayload = canonicalJson(payload);
  const signature = sign(null, Buffer.from(signedPayload, "utf8"), key).toString("base64url");
  return { signedPayload, signature, keyId };
}

export type VerifyResult =
  | { ok: true; payload: CertificatePayload }
  | { ok: false; reason: "UNKNOWN_KEY" | "BAD_SIGNATURE" | "MALFORMED" | "RECORD_MISMATCH" };

/**
 * @param record DB columns to cross-check against the signed payload
 */
export function verifyCertificate(
  signed: SignedCertificate,
  publicKeys: Readonly<Record<string, string>>,
  record: CertificateRecord,
): VerifyResult {
  const pub = publicKeys[signed.keyId];
  if (!pub) return { ok: false, reason: "UNKNOWN_KEY" };
  const key = createPublicKey({ key: Buffer.from(pub, "base64url"), format: "der", type: "spki" });
  let valid: boolean;
  try {
    valid = verify(null, Buffer.from(signed.signedPayload, "utf8"), key, Buffer.from(signed.signature, "base64url"));
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (!valid) return { ok: false, reason: "BAD_SIGNATURE" };

  let payload: CertificatePayload;
  try {
    payload = JSON.parse(signed.signedPayload) as CertificatePayload;
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (payload.v !== 1 && payload.v !== 2 && payload.v !== 3 && payload.v !== 4) return { ok: false, reason: "MALFORMED" };
  const base = {
    code: record.code, enrollmentId: record.enrollmentId, userId: record.userId, courseId: record.courseId,
    recipientName: record.recipientName, courseTitle: record.courseTitle, instructorName: record.instructorName,
    totalStudySec: record.totalStudySec, quizScore: record.quizScore, verifiedCourse: record.verifiedCourse, issuedAt: record.issuedAt,
  };
  const v2 = { documentName: record.documentName, documentType: record.documentType, expiresAt: record.expiresAt ?? null };
  const v3x = { ...v2, signerTitle: record.signerTitle ?? null, achievement: record.achievement ?? null, visualDigest: record.visualDigest ?? "" };
  const expected = payload.v === 1
    ? { ...base, v: 1 }
    : payload.v === 2
      ? { ...base, v: 2, ...v2 }
      : payload.v === 3
        ? { ...base, v: 3, ...v3x }
        : { ...base, v: 4, ...v3x, programId: record.programId ?? null, cohortId: record.cohortId ?? null };
  if (canonicalJson(expected) !== signed.signedPayload) return { ok: false, reason: "RECORD_MISMATCH" };
  return { ok: true, payload };
}

export { formatStudyDurationTh } from "./study-hours.ts";
