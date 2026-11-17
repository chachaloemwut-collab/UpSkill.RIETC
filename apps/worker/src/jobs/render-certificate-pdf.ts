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

interface PatternStyle {
  frame: string; inner: string; accent: string; title: string; kicker: string; sub: string; watermark: string; bg: string; ink: string; muted: string; orbs: boolean;
}

/** Certificate patterns the course editor can pick (credential_template_key). */
const PATTERNS: Record<string, PatternStyle> = {
  standard: { frame: "#6336c7", inner: "#14a6ca", accent: "#fa6b27", title: "#6336c7", kicker: "#14a6ca", sub: "#14a6ca", watermark: "#6336c7", bg: "#fffaf0", ink: "#17152e", muted: "#665f7a", orbs: true },
  classic: { frame: "#14532d", inner: "#166534", accent: "#b45309", title: "#14532d", kicker: "#166534", sub: "#166534", watermark: "#14532d", bg: "#ffffff", ink: "#1c1917", muted: "#57534e", orbs: false },
  royal: { frame: "#1e3a8a", inner: "#b8860b", accent: "#b8860b", title: "#1e3a8a", kicker: "#b8860b", sub: "#b8860b", watermark: "#1e3a8a", bg: "#fffdf5", ink: "#1c1917", muted: "#57534e", orbs: false },
  minimal: { frame: "#334155", inner: "#94a3b8", accent: "#475569", title: "#0f172a", kicker: "#64748b", sub: "#64748b", watermark: "#334155", bg: "#ffffff", ink: "#1c1917", muted: "#57534e", orbs: false },
};

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
  const coursePrefix = c.document_type_snapshot === "program" ? "หลักสูตรอบรม" : "หลักสูตร";
  const pattern = PATTERNS[c.template_snapshot] ?? PATTERNS.standard!;
  const align = c.text_align_snapshot === "left" ? "left" : "center";
  const isTest = c.document_type_snapshot === "development_test";

  // Optional background image: fetched once here (https only, configured by instructors/admins)
  // and embedded as a data URL, so the Playwright context can stay fully network-blocked.
  let backgroundUrl = "";
  if (c.background_url_snapshot) {
    try {
      const res = await fetch(c.background_url_snapshot, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
        if (mime.startsWith("image/")) backgroundUrl = `data:${mime};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
      }
    } catch {
      logger.warn({ code }, "certificate background image failed to load; rendering without it");
    }
  }

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
    ${fonts}
    @page { size: A4 landscape; margin: 0 }
    * { box-sizing: border-box }
    body { margin: 0; font-family: "Sarabun", sans-serif; color: ${pattern.ink}; }
    .page { width: 297mm; height: 210mm; position: relative; overflow: hidden; background: ${pattern.bg}; }
    ${backgroundUrl ? `.bgimg { position: absolute; left: 0; top: 0; right: 0; bottom: 0; background-image: url("${backgroundUrl}"); background-size: cover; background-position: center; opacity: .2; }` : ""}
    .orb { position: absolute; border-radius: 50%; opacity: .12; }
    .orb.a { width: 115mm; height: 115mm; background: ${pattern.frame}; left: -38mm; top: -38mm; }
    .orb.b { width: 135mm; height: 135mm; background: ${pattern.inner}; right: -48mm; bottom: -52mm; }
    .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-28deg); font-size: 30pt; font-weight: 700; color: ${pattern.watermark}; opacity: .05; white-space: nowrap; letter-spacing: .12em; }
    .frame { position: absolute; left: 7mm; top: 7mm; right: 7mm; bottom: 7mm; border: 1.2mm solid ${pattern.frame}; }
    .frame-inner { position: absolute; left: 10mm; top: 10mm; right: 10mm; bottom: 10mm; border: 0.3mm solid ${pattern.inner}; }
    .content { position: absolute; left: 20mm; right: 20mm; top: 15mm; bottom: 15mm; text-align: ${align}; }
    .kicker { letter-spacing: .25em; font-size: 10pt; color: ${pattern.kicker}; text-transform: uppercase; }
    h1 { font-size: 29pt; color: ${pattern.title}; margin: 1.5mm 0 2mm; font-weight: 700; }
    .sub { font-size: 8.5pt; color: ${pattern.sub}; letter-spacing: .18em; }
    .present { font-size: 13pt; margin-top: 5mm; }
    .name { font-size: 27pt; font-weight: 700; margin: 3mm 0 1.5mm; }
    .name-line { width: 118mm; height: 0.5mm; background: ${pattern.accent}; margin: 1mm ${align === "center" ? "auto" : "0"}; }
    .achieve { font-size: 12.5pt; margin-top: 3.5mm; }
    .course { font-size: 16.5pt; font-weight: 700; color: ${pattern.title}; margin: 2.5mm 0; }
    .meta { font-size: 10.5pt; color: ${pattern.muted}; line-height: 1.85; margin-top: 5mm; }
    .qr { position: absolute; left: 20mm; bottom: 11mm; width: 33mm; text-align: center; font-size: 7pt; color: ${pattern.muted}; }
    .qr img { width: 100%; display: block; }
    .right { position: absolute; right: 20mm; bottom: 15mm; text-align: right; font-size: 8.5pt; color: ${pattern.muted}; line-height: 1.6; }
    .digest { font-family: ui-monospace, monospace; color: ${pattern.title}; }
  </style></head><body><div class="page">
    ${backgroundUrl ? `<div class="bgimg"></div>` : ""}
    ${pattern.orbs ? `<div class="orb a"></div><div class="orb b"></div>` : ""}
    <div class="watermark" style="${isTest ? "color: #b91c1c; opacity: .14; font-size: 24pt;" : ""}">${isTest ? "TEST / DEVELOPMENT · สำหรับทดสอบระบบเท่านั้น · มิใช่การสำเร็จการศึกษาจริง" : "ต้นฉบับดิจิทัล · ตรวจสอบออนไลน์"}</div>
    ${isTest ? `<div style="position: absolute; top: 13mm; right: 18mm; border: 2px dashed #b91c1c; background: rgba(254, 242, 242, 0.95); color: #b91c1c; padding: 4px 14px; font-weight: 700; font-size: 11pt; border-radius: 4px; text-align: center; line-height: 1.25; z-index: 10;">TEST / DEVELOPMENT<br><span style="font-size: 7.5pt; font-weight: 400;">สำหรับทดสอบระบบเท่านั้น · มิใช่การสำเร็จการศึกษาจริง</span></div>` : ""}
    <div class="frame"></div><div class="frame-inner"></div>
    <div class="content">
      <div class="kicker">${esc(c.document_type_snapshot)}</div>
      <h1>${esc(c.document_name_snapshot)}</h1>
      <div class="sub">DIGITAL CERTIFICATE · VERIFIABLE ONLINE</div>
      <div class="present">ขอมอบให้แก่</div>
      <div class="name">${esc(c.recipient_name_snapshot)}</div>
      <div class="name-line"></div>
      <div class="achieve">${esc(achievementLine)}</div>
      <div class="course">${esc(coursePrefix)} ${esc(c.course_title_snapshot)}</div>
      <div class="meta">
        ผู้สอน ${esc(c.instructor_name_snapshot)}${esc(signerSuffix)}<br>
        ${isTest
          ? `เวลาเรียน: 0 นาที (ทดสอบระบบ) · ผลคะแนน: ทดสอบระบบ (TEST)<br>`
          : `เวลาเรียนสะสมจริง ${esc(formatStudyDurationTh(c.total_actual_study_sec))} · คะแนนสอบ ${esc(Number(c.quiz_score_snapshot).toFixed(2))}%<br>`}
        ออกให้เมื่อ ${esc(issued)}${expiry ? ` · ใช้ได้ถึง ${esc(expiry)}` : ""}${isTest ? " · เอกสารสำหรับทดสอบระบบ" : ""}
      </div>
    </div>
    <div class="qr"><img src="${qr}" alt=""><div>สแกนเพื่อตรวจสอบ</div><div>${esc(c.certificate_code)}</div></div>
    <div class="right">
      ${isTest ? `<span style="color: #b91c1c; font-weight: 700; font-size: 9pt;">[TEST / DEVELOPMENT]</span><br>` : ""}
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
