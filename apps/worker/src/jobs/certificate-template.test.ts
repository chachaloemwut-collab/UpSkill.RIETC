import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCertificateHtml, type CertificateView } from "./certificate-template.ts";

const view: CertificateView = {
  code: "UR-2026-AAAA-BBBB",
  documentType: "completion",
  documentName: "วุฒิบัตร",
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
  display: { issuer_name: "วิทยาลัยเทคนิคนิคมอุตสาหกรรมระยอง" },
};
const assets = { fontCss: "", qrDataUrl: "data:image/png;base64,AA==", verifyUrl: "https://example.test/verify/UR-2026-AAAA-BBBB", backgroundDataUrl: "" };

describe("certificate artwork", () => {
  it("escapes every snapshot field", () => {
    const html = buildCertificateHtml(
      { ...view, recipientName: `<img src=x onerror="x()">`, courseTitle: "a & b", signerTitle: "<b>t</b>", achievement: `"q'`, display: { issuer_name: "<i>" } },
      { ...assets, signatureDataUrl: "data:image/png;base64,SIG" },
    );
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("&lt;img src=x onerror=&quot;x()&quot;&gt;"));
    assert.ok(html.includes("a &amp; b"));
    assert.ok(html.includes("&lt;b&gt;t&lt;/b&gt;"));
    assert.ok(html.includes("&lt;i&gt;"));
  });

  it("uses the online-training วุฒิบัตร wording and never prints the score", () => {
    const html = buildCertificateHtml(view, assets);
    assert.ok(html.includes("วิทยาลัยเทคนิคนิคมอุตสาหกรรมระยอง"));
    assert.ok(html.includes("Rayong Industrial Estate Technical College"));
    assert.ok(html.includes("<h1>วุฒิบัตร</h1>"));
    assert.ok(html.includes("ฉบับนี้ให้ไว้เพื่อแสดงว่า"));
    assert.ok(html.includes("ได้ผ่านการอบรมออนไลน์"));
    assert.ok(html.includes("จำนวนชั่วโมงการอบรม ๒ ชั่วโมง ๑๕ นาที"));
    assert.ok(html.includes("ให้ไว้ ณ วันที่ ๑๙ พฤศจิกายน พ.ศ. ๒๕๖๙"));
    assert.ok(!html.includes("ร้อยละ") && !html.includes("คะแนน") && !html.includes("ผลการประเมิน") && !html.includes("๙๒"));
    assert.ok(!html.includes("TEST / DEVELOPMENT"));
  });

  it("prints the standard wording even for documents issued under older names", () => {
    const html = buildCertificateHtml({ ...view, documentName: "ใบประกาศนียบัตรสำเร็จการศึกษา", achievement: "ได้สำเร็จการศึกษาตามเกณฑ์มาตรฐาน" }, assets);
    assert.ok(html.includes("<h1>วุฒิบัตร</h1>"));
    assert.ok(!html.includes("ใบประกาศนียบัตร") && !html.includes("สำเร็จการศึกษาตามเกณฑ์"));
    const program = buildCertificateHtml({ ...view, documentType: "program" }, assets);
    assert.ok(program.includes(">ได้ผ่านการอบรม<"));
  });

  it("prints the college emblem when provided", () => {
    const html = buildCertificateHtml(view, { ...assets, emblemDataUrl: "data:image/png;base64,EMBLEM" });
    assert.ok(html.includes(`<img class="emblem" src="data:image/png;base64,EMBLEM"`));
  });

  it("prints no signer name at all without a signature image", () => {
    const off = buildCertificateHtml(view, assets);
    assert.ok(!off.includes("ดร.ผู้ลงนาม"));
    assert.ok(off.includes("รับรองด้วยลายมือชื่อดิจิทัล"));
    const on = buildCertificateHtml({ ...view, display: { issuer_name: "สถาบันทดสอบ" } }, { ...assets, signatureDataUrl: "data:image/png;base64,SIG" });
    assert.ok(on.includes("(ดร.ผู้ลงนาม)"));
    assert.ok(on.includes(`<img class="sig" src="data:image/png;base64,SIG"`));
    assert.ok(on.includes("สถาบันทดสอบ"));
    assert.ok(!on.includes("รับรองด้วยลายมือชื่อดิจิทัล"));
  });

  it("marks development test documents unmistakably", () => {
    const html = buildCertificateHtml({ ...view, documentType: "development_test" }, assets);
    assert.ok(html.includes("TEST / DEVELOPMENT"));
    assert.ok(html.includes("มิใช่การสำเร็จการศึกษาจริง"));
    assert.ok(html.includes("NOT A REAL CREDENTIAL"));
    assert.ok(!html.includes("จำนวนชั่วโมงการอบรม"));
  });

  it("falls back to the standard pattern and shrinks long names", () => {
    const short = buildCertificateHtml(view, assets);
    const long = buildCertificateHtml({ ...view, template: "unknown", recipientName: "ก".repeat(60) }, assets);
    assert.ok(short.includes("font-size: 33pt"));
    assert.ok(long.includes("font-size: 21pt"));
    assert.ok(long.includes("#4a2a9c"));
  });
});
