/**
 * HTML -> PDF with Playwright, in a sandbox:
 *  - JavaScript disabled in the page
 *  - every network request blocked (prevents SSRF if user data were ever injected as HTML)
 *  - every field is HTML-escaped
 *  - Thai fonts embedded from local files (data: URL) so vowels/tone marks render correctly with no CDN
 */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import QRCode from "qrcode";
import { formatStudyDurationTh } from "@upskill/core";
import type { Database } from "@upskill/db";
import type { Env } from "@upskill/infra/env";
import { logger } from "@upskill/infra/logger";
import { createCertificateStorage } from "@upskill/infra/storage";
import { addWorkerEmail } from "./process-email-outbox.ts";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const FONT_DIR = new URL("../../assets/fonts/", import.meta.url);

async function fontFace(file: string, weight: number): Promise<string> {
  try {
    const b64 = (await readFile(new URL(file, FONT_DIR))).toString("base64");
    return `@font-face { font-family: "Sarabun"; font-weight: ${weight}; src: url(data:font/ttf;base64,${b64}) format("truetype"); }`;
  } catch {
    logger.warn({ file }, "font missing: Thai text may render incorrectly (see assets/fonts/README.txt)");
    return "";
  }
}

export async function renderCertificatePdf(db: Database, env: Env, code: string) {
  const c = await db.selectFrom("certificates").selectAll().where("certificate_code", "=", code).executeTakeFirstOrThrow();

  const verifyUrl = `${env.APP_ORIGIN}/verify/${encodeURIComponent(c.certificate_code)}`;
  const qr = await QRCode.toDataURL(verifyUrl, { errorCorrectionLevel: "M", margin: 1, width: 360 });
  const fonts = (await Promise.all([fontFace("Sarabun-Regular.ttf", 400), fontFace("Sarabun-Bold.ttf", 700)])).join("\n");
  const issued = new Date(c.issued_at).toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" });
  const expiry = c.expires_at ? new Date(c.expires_at).toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }) : null;
  const achievementLine = c.achievement_snapshot ?? "ได้ผ่านการอบรมและการประเมินตามเกณฑ์";
  const signerSuffix = c.signer_title_snapshot ? ` · ${c.signer_title_snapshot}` : "";

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
    ${fonts}
    @page { size: A4 landscape; margin: 0 }
    * { box-sizing: border-box }
    body { margin: 0; font-family: "Sarabun", sans-serif; color: #17152e; }
    .page { width: 297mm; height: 210mm; position: relative; overflow: hidden; background: #fffaf0; }
    .orb { position: absolute; border-radius: 50%; opacity: .12; }
    .orb.a { width: 115mm; height: 115mm; background: #6336c7; left: -38mm; top: -38mm; }
    .orb.b { width: 135mm; height: 135mm; background: #14a6ca; right: -48mm; bottom: -52mm; }
    .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-28deg); font-size: 30pt; font-weight: 700; color: #6336c7; opacity: .05; white-space: nowrap; letter-spacing: .12em; }
    .frame { position: absolute; left: 7mm; top: 7mm; right: 7mm; bottom: 7mm; border: 1.2mm solid #6336c7; }
    .frame-inner { position: absolute; left: 10mm; top: 10mm; right: 10mm; bottom: 10mm; border: 0.3mm solid #14a6ca; }
    .content { position: absolute; left: 20mm; right: 20mm; top: 15mm; bottom: 15mm; }
    .kicker { text-align: center; letter-spacing: .25em; font-size: 10pt; color: #14a6ca; text-transform: uppercase; }
    h1 { text-align: center; font-size: 29pt; color: #6336c7; margin: 1.5mm 0 2mm; font-weight: 700; }
    .sub { text-align: center; font-size: 8.5pt; color: #14a6ca; letter-spacing: .18em; }
    .present { text-align: center; font-size: 13pt; color: #17152e; margin-top: 5mm; }
    .name { text-align: center; font-size: 27pt; font-weight: 700; margin: 3mm 0 1.5mm; }
    .name-line { width: 118mm; height: 0.5mm; background: #fa6b27; margin: 1mm auto; }
    .achieve { text-align: center; font-size: 12.5pt; color: #17152e; margin-top: 3.5mm; }
    .course { text-align: center; font-size: 16.5pt; font-weight: 700; color: #6336c7; margin: 2.5mm 0; }
    .meta { text-align: center; font-size: 10.5pt; color: #665f7a; line-height: 1.85; margin-top: 5mm; }
    .qr { position: absolute; left: 20mm; bottom: 11mm; width: 33mm; text-align: center; font-size: 7pt; color: #665f7a; }
    .qr img { width: 100%; display: block; }
    .right { position: absolute; right: 20mm; bottom: 15mm; text-align: right; font-size: 8.5pt; color: #665f7a; line-height: 1.6; }
    .digest { font-family: ui-monospace, monospace; color: #6336c7; }
  </style></head><body><div class="page">
    <div class="orb a"></div><div class="orb b"></div>
    <div class="watermark">ต้นฉบับดิจิทัล · ตรวจสอบออนไลน์</div>
    <div class="frame"></div><div class="frame-inner"></div>
    <div class="content">
      <div class="kicker">${esc(c.document_type_snapshot)}</div>
      <h1>${esc(c.document_name_snapshot)}</h1>
      <div class="sub">DIGITAL CERTIFICATE · VERIFIABLE ONLINE</div>
      <div class="present">ขอมอบให้แก่</div>
      <div class="name">${esc(c.recipient_name_snapshot)}</div>
      <div class="name-line"></div>
      <div class="achieve">${esc(achievementLine)}</div>
      <div class="course">หลักสูตร ${esc(c.course_title_snapshot)}</div>
      <div class="meta">
        ผู้สอน ${esc(c.instructor_name_snapshot)}${esc(signerSuffix)}<br>
        เวลาเรียนสะสมจริง ${esc(formatStudyDurationTh(c.total_actual_study_sec))} · คะแนนสอบ ${esc(Number(c.quiz_score_snapshot).toFixed(2))}%<br>
        ออกให้เมื่อ ${esc(issued)}${expiry ? ` · ใช้ได้ถึง ${esc(expiry)}` : ""}
      </div>
    </div>
    <div class="qr"><img src="${qr}" alt=""><div>สแกนเพื่อตรวจสอบ</div><div>${esc(c.certificate_code)}</div></div>
    <div class="right">
      ลายนิ้วมือภาพ<br><span class="digest">${esc(c.visual_digest || "-")}</span><br><br>
      เอกสารต้นฉบับดิจิทัล<br>ลงนาม Ed25519 · ตรวจสอบออนไลน์ได้
    </div>
  </div></body></html>`;

  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true });
    await createCertificateStorage(env).save(c.certificate_code, pdf);
    const owner = await db.selectFrom("users").select("email").where("id", "=", c.user_id).executeTakeFirstOrThrow();
    await db.transaction().execute(async (trx) => {
      await trx.updateTable("certificates").set({ pdf_ready_at: new Date(), pdf_failed_at: null, pdf_last_error: null }).where("id", "=", c.id).execute();
      await addWorkerEmail(
        trx,
        {
          template: "credential-ready",
          to: owner.email,
          documentName: c.document_name_snapshot,
          courseTitle: c.course_title_snapshot,
          code: c.certificate_code,
          downloadLink: `${env.APP_ORIGIN}/api/certificates/${encodeURIComponent(c.certificate_code)}/download`,
          verifyLink: verifyUrl,
        },
        { userId: c.user_id, deduplicationKey: `credential-ready:${c.id}` },
      );
    });
    logger.info({ code: c.certificate_code }, "certificate pdf rendered");
  } finally {
    await browser.close();
  }
}
