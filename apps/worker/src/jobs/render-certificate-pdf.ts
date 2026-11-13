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
import { saveCertificatePdf } from "@upskill/infra/storage";
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

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
    ${fonts}
    @page { size: A4 landscape; margin: 0 }
    * { box-sizing: border-box }
    body { margin: 0; font-family: "Sarabun", sans-serif; color: #1c1917; }
    .page { width: 297mm; height: 210mm; padding: 14mm; }
    .frame { height: 100%; border: 1.2mm solid #14532d; outline: 0.4mm solid #14532d; outline-offset: -3mm; padding: 16mm 22mm; position: relative; }
    .kicker { letter-spacing: 0.3em; font-size: 11pt; color: #166534; text-transform: uppercase; }
    h1 { font-size: 36pt; margin: 2mm 0 10mm; font-weight: 700; }
    .name { font-size: 30pt; font-weight: 700; margin: 3mm 0 6mm; border-bottom: 0.3mm solid #a8a29e; display: inline-block; padding-bottom: 2mm; min-width: 120mm; }
    .course { font-size: 18pt; font-weight: 700; }
    .meta { margin-top: 10mm; font-size: 11pt; color: #44403c; line-height: 1.7; }
    .badge { display: inline-block; padding: 1mm 3mm; border-radius: 2mm; font-size: 9pt; background: ${c.is_verified_course_snapshot ? "#dcfce7" : "#f5f5f4"}; color: ${c.is_verified_course_snapshot ? "#14532d" : "#44403c"}; }
    .qr { position: absolute; right: 16mm; bottom: 14mm; width: 38mm; text-align: center; font-size: 7.5pt; color: #57534e; }
    .qr img { width: 100%; display: block; }
  </style></head><body><div class="page"><div class="frame">
    <div class="kicker">${esc(c.document_type_snapshot)}</div>
    <h1>${esc(c.document_name_snapshot)}</h1>
    <div>ขอมอบให้แก่</div>
    <div class="name">${esc(c.recipient_name_snapshot)}</div>
    <div>ได้สำเร็จการศึกษาหลักสูตร</div>
    <div class="course">${esc(c.course_title_snapshot)}</div>
    <div class="meta">
      ผู้สอน ${esc(c.instructor_name_snapshot)}<br>
      เวลาเรียนสะสมจริง ${esc(formatStudyDurationTh(c.total_actual_study_sec))} · คะแนนสอบ ${esc(Number(c.quiz_score_snapshot).toFixed(2))}%<br>
      ออกให้เมื่อ ${esc(issued)} · <span class="badge">${c.is_verified_course_snapshot ? "Verified Course" : "Community Course"}</span>
      ${c.expires_at ? `<br>ใช้ได้ถึง ${esc(new Date(c.expires_at).toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }))}` : ""}
    </div>
    <div class="qr"><img src="${qr}" alt=""><div>สแกนเพื่อตรวจสอบ</div><div>${esc(c.certificate_code)}</div></div>
  </div></div></body></html>`;

  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true });
    await saveCertificatePdf(env.CERT_STORAGE_DIR, c.certificate_code, pdf);
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
