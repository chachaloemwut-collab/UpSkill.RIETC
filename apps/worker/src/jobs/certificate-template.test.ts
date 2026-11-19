import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCertificateHtml, type CertificateView } from "./certificate-template.ts";

const view: CertificateView = {
  code: "UR-2026-AAAA-BBBB",
  documentType: "completion",
  documentName: "เกียรติบัตร",
  recipientName: "สมหญิง ใจดี",
  courseTitle: "หลักสูตรทดสอบ",
  signerName: "ดร.ผู้ลงนาม",
  signerTitle: null,
  achievement: null,
  studySec: 8100,
  quizScore: "92.5",
  issuedAt: new Date("2026-11-19T03:00:00Z"),
  expiresAt: null,
  template: "standard",
  textAlign: "center",
  visualDigest: "abcd-1234",
};
const assets = { fontCss: "", qrDataUrl: "data:image/png;base64,AA==", verifyUrl: "https://example.test/verify/UR-2026-AAAA-BBBB", backgroundDataUrl: "" };

describe("certificate artwork", () => {
  it("escapes every snapshot field", () => {
    const html = buildCertificateHtml(
      { ...view, recipientName: `<img src=x onerror="x()">`, courseTitle: "a & b", signerTitle: "<b>t</b>", achievement: `"q'` },
      assets,
    );
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("&lt;img src=x onerror=&quot;x()&quot;&gt;"));
    assert.ok(html.includes("a &amp; b"));
    assert.ok(html.includes("&lt;b&gt;t&lt;/b&gt;"));
    assert.ok(html.includes("&quot;q&#39;"));
  });

  it("shows the real study time, score and Buddhist-era year", () => {
    const html = buildCertificateHtml(view, assets);
    assert.ok(html.includes("2 ชั่วโมง 15 นาที"));
    assert.ok(html.includes("92.50%"));
    assert.ok(html.includes(">2569<"));
    assert.ok(!html.includes("TEST / DEVELOPMENT"));
  });

  it("marks development test documents unmistakably", () => {
    const html = buildCertificateHtml({ ...view, documentType: "development_test" }, assets);
    assert.ok(html.includes("TEST / DEVELOPMENT"));
    assert.ok(html.includes("มิใช่การสำเร็จการศึกษาจริง"));
    assert.ok(html.includes("NOT A REAL CREDENTIAL"));
    assert.ok(!html.includes("92.50%"));
  });

  it("falls back to the standard pattern and shrinks long names", () => {
    const short = buildCertificateHtml(view, assets);
    const long = buildCertificateHtml({ ...view, template: "unknown", recipientName: "ก".repeat(60) }, assets);
    assert.ok(short.includes("font-size: 38pt"));
    assert.ok(long.includes("font-size: 23pt"));
    assert.ok(long.includes("#4a2a9c"));
  });
});
