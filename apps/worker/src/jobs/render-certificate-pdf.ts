/**
 * HTML -> PDF with Playwright, in a sandbox:
 *  - JavaScript disabled in the page
 *  - every network request blocked (prevents SSRF if user data were ever injected as HTML)
 *  - every field is HTML-escaped (artwork lives in certificate-template.ts)
 *  - Thai fonts embedded from local files (data: URL) so vowels/tone marks render correctly with no CDN
 */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import QRCode from "qrcode";
import type { Database } from "@upskill/db";
import type { Env } from "@upskill/infra/env";
import { logger } from "@upskill/infra/logger";
import { createCertificateStorage, createSignatureStorage } from "@upskill/infra/storage";
import { addWorkerEmail } from "./process-email-outbox.ts";
import { buildCertificateHtml } from "./certificate-template.ts";
import { parseCertificateDisplay } from "@upskill/core/certificate-patterns";

const FONT_DIR = new URL("../../assets/fonts/", import.meta.url);
const EMBLEM = new URL("../../assets/brand/rietc-emblem.png", import.meta.url);

async function fontFace(family: string, file: string, weight: number): Promise<string> {
  try {
    const b64 = (await readFile(new URL(file, FONT_DIR))).toString("base64");
    return `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url(data:font/ttf;base64,${b64}) format("truetype"); }`;
  } catch {
    logger.warn({ file }, "font missing: Thai text may render incorrectly (see assets/fonts/README.txt)");
    return "";
  }
}

/** opts.notify=false: re-render of an issued document (artwork update) — replace the PDF only, send no email. */
export async function renderCertificatePdf(db: Database, env: Env, code: string, opts: { notify?: boolean } = {}) {
  const c = await db.selectFrom("certificates").selectAll().where("certificate_code", "=", code).executeTakeFirstOrThrow();

  // Site-wide layout options (issuing body); a missing row means the defaults
  const displayRow = await db.selectFrom("system_settings").select("value").where("key", "=", "certificate_display").executeTakeFirst();
  const display = parseCertificateDisplay(displayRow?.value);

  const verifyUrl = `${env.APP_ORIGIN}/verify/${encodeURIComponent(c.certificate_code)}`;
  const qr = await QRCode.toDataURL(verifyUrl, { errorCorrectionLevel: "M", margin: 1, width: 360 });
  const fontCss = (
    await Promise.all([
      fontFace("Sarabun", "Sarabun-Regular.ttf", 400),
      fontFace("Sarabun", "Sarabun-Bold.ttf", 700),
      fontFace("Prompt", "Prompt-Medium.ttf", 500),
      fontFace("Prompt", "Prompt-SemiBold.ttf", 600),
    ])
  ).join("\n");

  const emblemDataUrl = await readFile(EMBLEM)
    .then((b) => `data:image/png;base64,${b.toString("base64")}`)
    .catch(() => {
      logger.warn("college emblem missing (assets/brand/rietc-emblem.png); rendering the drawn medallion");
      return "";
    });

  // Signature chosen at issue time (NULL = no signer block). If the file is gone, print no signer rather than fail.
  let signatureDataUrl = "";
  if (c.signature_key_snapshot) {
    const img = await createSignatureStorage(env).read(c.signature_key_snapshot).catch(() => null);
    if (img) signatureDataUrl = `data:image/${c.signature_key_snapshot.endsWith(".png") ? "png" : "jpeg"};base64,${img.toString("base64")}`;
    else logger.warn({ code }, "certificate signature image missing; rendering without the signer block");
  }

  // Optional background image: fetched once here (https only, configured by instructors/admins)
  // and embedded as a data URL, so the Playwright context can stay fully network-blocked.
  let backgroundDataUrl = "";
  if (c.background_url_snapshot) {
    try {
      const res = await fetch(c.background_url_snapshot, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
        // The mime type comes from a remote header and ends up in a style attribute: allow only a plain token
        if (/^image\/[a-z0-9.+-]+$/i.test(mime)) backgroundDataUrl = `data:${mime};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
      }
    } catch {
      logger.warn({ code }, "certificate background image failed to load; rendering without it");
    }
  }

  const html = buildCertificateHtml(
    {
      code: c.certificate_code,
      documentType: c.document_type_snapshot,
      documentName: c.document_name_snapshot,
      recipientName: c.recipient_name_snapshot,
      courseTitle: c.course_title_snapshot,
      signerName: c.instructor_name_snapshot,
      signerTitle: c.signer_title_snapshot,
      achievement: c.achievement_snapshot,
      studySec: c.total_actual_study_sec,
      quizScore: c.quiz_score_snapshot,
      issuedAt: new Date(c.issued_at),
      expiresAt: c.expires_at ? new Date(c.expires_at) : null,
      template: c.template_snapshot,
      textAlign: c.text_align_snapshot,
      visualDigest: c.visual_digest,
      display,
    },
    { fontCss, qrDataUrl: qr, verifyUrl, backgroundDataUrl, emblemDataUrl, signatureDataUrl },
  );

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
      if (opts.notify === false) return;
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
