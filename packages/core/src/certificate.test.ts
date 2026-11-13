import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_CODE_RE,
  canonicalJson,
  formatStudyDurationTh,
  generateCertificateCode,
  signCertificate,
  verifyCertificate,
  type CertificatePayload,
} from "./certificate.ts";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const priv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url");
const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64url");

const payload: CertificatePayload = {
  v: 1,
  code: "CERT-2026-7QK2-M9XA-4HTB",
  enrollmentId: "e1",
  userId: "u1",
  courseId: "c1",
  recipientName: "สมชาย ใจดี | admin",
  courseTitle: "พื้นฐาน TypeScript",
  instructorName: "ครูเอ",
  totalStudySec: 8100,
  quizScore: "92.50",
  verifiedCourse: true,
  issuedAt: "2026-11-13T03:00:00.123Z",
};
const { v: _v, ...record } = payload;

describe("certificate", () => {
  it("generates codes in the expected format", () => {
    for (let i = 0; i < 50; i++) expect(generateCertificateCode(2026)).toMatch(CERTIFICATE_CODE_RE);
  });

  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: [true, "x"] })).toBe(canonicalJson({ a: [true, "x"], b: 1 }));
  });

  it("round-trips sign/verify", () => {
    const signed = signCertificate(payload, "k1", priv);
    expect(verifyCertificate(signed, { k1: pub }, record)).toMatchObject({ ok: true });
  });

  it("round-trips a v2 credential with document metadata and expiry", () => {
    const v2 = { ...payload, v: 2 as const, documentName: "ใบรับรอง", documentType: "completion", expiresAt: "2027-11-13T03:00:00.123Z" };
    const { v: _version, ...v2Record } = v2;
    const signed = signCertificate(v2, "k1", priv);
    expect(verifyCertificate(signed, { k1: pub }, v2Record)).toMatchObject({ ok: true, payload: { v: 2, documentType: "completion" } });
  });

  it("detects a DB row edited after issuance", () => {
    const signed = signCertificate(payload, "k1", priv);
    expect(verifyCertificate(signed, { k1: pub }, { ...record, totalStudySec: 99999 })).toEqual({
      ok: false,
      reason: "RECORD_MISMATCH",
    });
  });

  it("detects a tampered payload", () => {
    const signed = signCertificate(payload, "k1", priv);
    const tampered = { ...signed, signedPayload: signed.signedPayload.replace("8100", "9100") };
    expect(verifyCertificate(tampered, { k1: pub }, record)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects unknown key ids", () => {
    const signed = signCertificate(payload, "k1", priv);
    expect(verifyCertificate(signed, {}, record)).toEqual({ ok: false, reason: "UNKNOWN_KEY" });
  });

  it("formats Thai durations", () => {
    expect(formatStudyDurationTh(8100)).toBe("2 ชั่วโมง 15 นาที");
    expect(formatStudyDurationTh(600)).toBe("10 นาที");
  });
});
