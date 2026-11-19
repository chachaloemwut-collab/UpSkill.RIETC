/**
 * Certificate artwork: a pure function from the stored snapshot to a self-contained HTML page (A4 landscape).
 * No I/O and no network: fonts, QR code and background arrive as data: URLs, every text field is HTML-escaped,
 * and every ornament is inline SVG generated here. The signed payload and visual digest do not depend on this
 * file, so the artwork can change without touching issued certificates' signatures.
 */
import { formatStudyDurationTh } from "@upskill/core";
import {
  certificateKicker,
  certificatePattern,
  formalThaiDate,
  thaiDigits,
  type CertificateDisplay,
  type CertificatePalette,
} from "@upskill/core/certificate-patterns";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface CertificateView {
  code: string;
  documentType: string;
  documentName: string;
  recipientName: string;
  courseTitle: string;
  signerName: string;
  signerTitle: string | null;
  achievement: string | null;
  studySec: number;
  quizScore: string | number;
  issuedAt: Date;
  expiresAt: Date | null;
  template: string;
  textAlign: string;
  visualDigest: string;
  /** Site-wide layout options (signature block, issuing body), read at render time */
  display: CertificateDisplay;
}

export interface CertificateAssets {
  /** @font-face rules with data: URLs (families "Prompt" and "Sarabun") */
  fontCss: string;
  /** QR code image as a data: URL */
  qrDataUrl: string;
  verifyUrl: string;
  /** Optional background image as a data: URL ("" for none) */
  backgroundDataUrl: string;
}

const BRAND = "UpskillReskill.RIETC";

/** Long names/titles step down in size instead of wrapping into the signature row. */
const fit = (text: string, steps: [number, number][], fallback: number) => {
  const n = [...text].length;
  for (const [max, pt] of steps) if (n <= max) return pt;
  return fallback;
};

const f = (n: number) => n.toFixed(2);

/**
 * Guilloche rosette: several phase-shifted wavy rings, the classic banknote/seal ornament.
 * Coordinates are in the caller's SVG units, centred on (cx, cy).
 */
export function rosette(cx: number, cy: number, r: number, opts: { lobes?: number; rings?: number; amp?: number; stroke: string; width: number; opacity?: number }) {
  const { lobes = 18, rings = 6, amp = 0.11, stroke, width, opacity = 1 } = opts;
  const paths: string[] = [];
  for (let i = 0; i < rings; i++) {
    const phase = (i / rings) * Math.PI * 2 / lobes;
    const pts: string[] = [];
    for (let s = 0; s <= 360; s++) {
      const t = (s / 360) * Math.PI * 2;
      const rr = r * (1 - amp + amp * Math.sin(lobes * (t + phase)));
      pts.push(`${f(cx + rr * Math.cos(t))},${f(cy + rr * Math.sin(t))}`);
    }
    paths.push(`M${pts.join("L")}Z`);
  }
  return `<path d="${paths.join(" ")}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${opacity}"/>`;
}

/** Interlaced sine "rope" running along a rectangle band (between two frame rules). */
function guillocheBand(x0: number, y0: number, x1: number, y1: number, amp: number, period: number, stroke: string, width: number) {
  const strands = 4;
  const out: string[] = [];
  const side = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const nx = -uy, ny = ux;
    const steps = Math.ceil(len / 0.6);
    for (let k = 0; k < strands; k++) {
      const phase = (k / strands) * Math.PI * 2;
      const pts: string[] = [];
      for (let s = 0; s <= steps; s++) {
        const d = (s / steps) * len;
        const o = amp * Math.sin((d / period) * Math.PI * 2 + phase);
        pts.push(`${f(ax + ux * d + nx * o)},${f(ay + uy * d + ny * o)}`);
      }
      out.push(`M${pts.join("L")}`);
    }
  };
  side(x0, y0, x1, y0);
  side(x1, y0, x1, y1);
  side(x1, y1, x0, y1);
  side(x0, y1, x0, y0);
  return `<path d="${out.join(" ")}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-opacity=".55"/>`;
}

/** Circular seal with text on a ring; static artwork (verification itself happens online via the QR code). */
function seal(p: CertificatePalette, year: string, isTest: boolean) {
  const ringText = isTest ? "TEST / DEVELOPMENT · NOT A REAL CREDENTIAL ·" : "DIGITALLY SIGNED · ED25519 · VERIFIABLE ONLINE ·";
  const core = isTest ? "#b91c1c" : p.frame;
  return `<svg class="seal" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><path id="sealRing" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0"/></defs>
    ${rosette(50, 50, 48, { lobes: 30, rings: 5, amp: 0.05, stroke: p.frame, width: 0.35, opacity: 0.85 })}
    <circle cx="50" cy="50" r="42.5" fill="${p.bg}" stroke="${p.accent}" stroke-width="0.8"/>
    <circle cx="50" cy="50" r="31" fill="none" stroke="${p.accent}" stroke-width="0.5"/>
    <text font-family="Prompt" font-weight="600" font-size="5.6" fill="${core}"><textPath href="#sealRing" textLength="228" lengthAdjust="spacing">${ringText}</textPath></text>
    ${rosette(50, 50, 28, { lobes: 14, rings: 4, amp: 0.14, stroke: p.inner, width: 0.3, opacity: 0.6 })}
    <circle cx="50" cy="50" r="19" fill="${core}"/>
    <circle cx="50" cy="50" r="16.6" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".35"/>
    <path d="M42.5,46.5 l4.6,4.6 l10,-10" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="50" y="60.2" text-anchor="middle" font-family="Prompt" font-weight="600" font-size="5.2" letter-spacing=".4" fill="#fff">${esc(year)}</text>
  </svg>`;
}

/** Thin rule with a diamond in the middle, used under the recipient name. */
function divider(p: CertificatePalette, widthMm: number) {
  const w = widthMm, m = w / 2;
  return `<svg class="divider" width="${w}mm" height="4mm" viewBox="0 0 ${w} 4" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <line x1="0" y1="2" x2="${m - 4}" y2="2" stroke="${p.accent}" stroke-width=".35"/>
    <line x1="${m + 4}" y1="2" x2="${w}" y2="2" stroke="${p.accent}" stroke-width=".35"/>
    <path d="M${m},0.4 L${m + 1.6},2 L${m},3.6 L${m - 1.6},2 Z" fill="${p.accent}"/>
    <circle cx="${m - 3}" cy="2" r=".45" fill="${p.accent}"/><circle cx="${m + 3}" cy="2" r=".45" fill="${p.accent}"/>
  </svg>`;
}

/** Page-sized SVG frame (mm units): outer rule, guilloche band, inner gold rule, corner rosettes, faint centre rosette. */
function frame(p: CertificatePalette) {
  const W = 297, H = 210;
  const corners = [[13, 13], [W - 13, 13], [W - 13, H - 13], [13, H - 13]] as const;
  return `<svg class="frame" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${rosette(W / 2, H / 2 - 6, 70, { lobes: 36, rings: 7, amp: 0.06, stroke: p.frame, width: 0.18, opacity: 0.055 })}
    ${rosette(W / 2, H / 2 - 6, 44, { lobes: 22, rings: 6, amp: 0.12, stroke: p.inner, width: 0.16, opacity: 0.05 })}
    <rect x="7" y="7" width="${W - 14}" height="${H - 14}" fill="none" stroke="${p.frame}" stroke-width="1.1"/>
    <rect x="8.6" y="8.6" width="${W - 17.2}" height="${H - 17.2}" fill="none" stroke="${p.frame}" stroke-width=".25"/>
    ${p.ornate ? guillocheBand(11, 11, W - 11, H - 11, 1.15, 5.2, p.inner, 0.16) : ""}
    <rect x="14.2" y="14.2" width="${W - 28.4}" height="${H - 28.4}" fill="none" stroke="${p.accent}" stroke-width=".45"/>
    ${p.ornate
      ? corners
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.4" fill="${p.bg}" stroke="${p.accent}" stroke-width=".4"/>${rosette(x, y, 4.6, { lobes: 8, rings: 4, amp: 0.25, stroke: p.frame, width: 0.18, opacity: 0.9 })}<circle cx="${x}" cy="${y}" r=".8" fill="${p.accent}"/>`)
          .join("")
      : corners.map(([x, y]) => `<path d="M${x - 2.2},${y} L${x},${y - 2.2} L${x + 2.2},${y} L${x},${y + 2.2} Z" fill="${p.accent}"/>`).join("")}
  </svg>`;
}

/** Small medallion above the issuing body, standing in for an institutional emblem. */
function emblem(p: CertificatePalette) {
  return `<svg class="emblem" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${rosette(20, 20, 19, { lobes: 16, rings: 5, amp: 0.1, stroke: p.frame, width: 0.3, opacity: 0.9 })}
    <circle cx="20" cy="20" r="12.5" fill="${p.bg}" stroke="${p.accent}" stroke-width=".7"/>
    ${rosette(20, 20, 10, { lobes: 8, rings: 4, amp: 0.22, stroke: p.accent, width: 0.35, opacity: 0.95 })}
    <circle cx="20" cy="20" r="2.2" fill="${p.frame}"/>
  </svg>`;
}

export function buildCertificateHtml(c: CertificateView, a: CertificateAssets): string {
  const p = certificatePattern(c.template);
  const isTest = c.documentType === "development_test";
  const left = c.textAlign === "left";
  const showSigner = c.display.show_signer && !!c.signerName.trim();
  const issuer = c.display.issuer_name.trim();
  const coursePrefix = c.documentType === "program" ? "หลักสูตรอบรม" : "หลักสูตร";
  const achievement = c.achievement ?? "ได้ผ่านการอบรมและการประเมินผลตามเกณฑ์ของ";
  const nameSize = fit(c.recipientName, [[26, 36], [34, 31], [44, 26]], 22);
  const courseText = `${coursePrefix} ${c.courseTitle}`;
  const courseSize = fit(courseText, [[50, 18], [70, 15.5], [95, 13.5]], 12);
  const titleSize = fit(c.documentName, [[12, 38], [36, 28], [56, 23]], 19);
  const year = String(Number(c.issuedAt.toLocaleDateString("en-US", { year: "numeric", timeZone: "Asia/Bangkok" })) + 543);
  const detail = isTest
    ? "เอกสารสำหรับทดสอบระบบ ไม่มีเวลาเรียนและผลการประเมินจริง"
    : `รวมเวลาเรียน ${thaiDigits(formatStudyDurationTh(c.studySec))} · ผลการประเมินร้อยละ ${thaiDigits(Number(c.quizScore).toFixed(2))}`;

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
    ${a.fontCss}
    @page { size: A4 landscape; margin: 0 }
    * { box-sizing: border-box }
    body { margin: 0; font-family: "Sarabun", sans-serif; color: ${p.ink}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: 297mm; height: 210mm; position: relative; overflow: hidden;
      background: radial-gradient(ellipse 75% 70% at 50% 45%, ${p.bg} 55%, color-mix(in srgb, ${p.bg} 88%, ${p.accent}) 100%); }
    .bgimg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: .16; }
    .frame { position: absolute; inset: 0; width: 297mm; height: 210mm; }
    .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-24deg); font-weight: 700; white-space: nowrap; color: #b91c1c; opacity: .13; font-size: 24pt; letter-spacing: .08em; }
    .test-badge { position: absolute; top: 19mm; right: 22mm; border: 2px dashed #b91c1c; background: rgba(254,242,242,.95); color: #b91c1c; padding: 4px 14px; font-weight: 700; font-size: 11pt; border-radius: 4px; text-align: center; line-height: 1.25; z-index: 10; }
    .test-badge span { font-size: 7.5pt; font-weight: 400; }

    .content { position: absolute; left: 30mm; right: 30mm; top: 18mm; bottom: 58mm; display: flex; flex-direction: column; justify-content: center; align-items: ${left ? "flex-start" : "center"}; text-align: ${left ? "left" : "center"}; }
    .emblem { width: 15mm; height: 15mm; display: block; }
    .issuer { margin-top: 2mm; font-family: "Prompt", sans-serif; font-weight: 500; font-size: ${issuer ? "12.5pt" : "8pt"}; ${issuer ? "" : "letter-spacing: .38em; text-transform: uppercase;"} color: ${issuer ? p.ink : p.muted}; }
    h1 { font-family: "Prompt", sans-serif; font-weight: 600; font-size: ${titleSize}pt; line-height: 1.2; color: ${p.title}; margin: 1.5mm 0 0; letter-spacing: .02em; }
    .kicker { margin-top: .8mm; font-family: "Prompt", sans-serif; font-weight: 500; font-size: 8.5pt; letter-spacing: .34em; text-transform: uppercase; color: ${p.accent}; }
    .kicker::before, .kicker::after { content: ""; display: inline-block; width: 12mm; height: .3mm; background: ${p.accent}; vertical-align: middle; margin: 0 4mm; opacity: .8; }
    ${left ? ".kicker::before { display: none; }" : ""}
    .present { font-size: 13pt; color: ${p.muted}; margin-top: 5mm; }
    .name { font-family: "Prompt", sans-serif; font-weight: 600; font-size: ${nameSize}pt; line-height: 1.3; color: ${p.ink}; margin-top: 1mm; }
    .divider { display: block; margin-top: .8mm; }
    .achieve { font-size: 13pt; margin-top: 3mm; color: ${p.ink}; }
    .course { font-family: "Prompt", sans-serif; font-weight: 600; font-size: ${courseSize}pt; line-height: 1.35; color: ${p.title}; margin-top: 1mm; max-width: 225mm; }
    .detail { font-size: 11.5pt; color: ${p.muted}; margin-top: 2.5mm; }
    .given { font-family: "Prompt", sans-serif; font-weight: 500; font-size: 12pt; color: ${p.ink}; margin-top: 4mm; }
    .expiry { font-size: 9.5pt; color: ${p.muted}; margin-top: .5mm; }

    .bottom { position: absolute; left: 26mm; right: 26mm; bottom: 24mm; height: 36mm; }
    .qr { position: absolute; left: 0; bottom: 0; display: flex; align-items: flex-end; gap: 3.5mm; }
    .qr img { width: 26mm; height: 26mm; display: block; border: .3mm solid color-mix(in srgb, ${p.frame} 25%, transparent); padding: 1mm; background: #fff; }
    .qr .t { font-size: 8pt; color: ${p.muted}; line-height: 1.45; }
    .qr .t b { display: block; font-family: "Prompt", sans-serif; font-weight: 600; font-size: 8.5pt; color: ${p.title}; }
    .code { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 9pt; color: ${p.ink}; letter-spacing: .04em; }
    .seal { position: absolute; left: 50%; bottom: -4mm; width: 40mm; height: 40mm; transform: translateX(-50%); }
    .sign { position: absolute; right: 0; bottom: 0; width: 72mm; text-align: center; }
    .sign .line { height: .3mm; background: ${p.ink}; opacity: .55; margin-bottom: 2mm; }
    .sign .n { font-family: "Prompt", sans-serif; font-weight: 600; font-size: 12pt; color: ${p.ink}; }
    .sign .r { font-size: 9pt; color: ${p.muted}; margin-top: .5mm; line-height: 1.35; }
    .attest { position: absolute; right: 0; bottom: 0; width: 68mm; text-align: right; font-size: 8pt; line-height: 1.5; color: ${p.muted}; }
    .attest b { display: block; font-family: "Prompt", sans-serif; font-weight: 600; font-size: 8.5pt; color: ${p.title}; }
    .foot { position: absolute; left: 26mm; right: 26mm; bottom: 17.2mm; text-align: center; font-size: 6.8pt; color: ${p.muted}; letter-spacing: .02em; }
    .foot .digest { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; color: ${p.title}; }
  </style></head><body><div class="page">
    ${a.backgroundDataUrl ? `<div class="bgimg" style="background-image: url('${a.backgroundDataUrl}')"></div>` : ""}
    ${frame(p)}
    ${isTest ? `<div class="watermark">TEST / DEVELOPMENT · สำหรับทดสอบระบบเท่านั้น · มิใช่การสำเร็จการศึกษาจริง</div>` : ""}
    ${isTest ? `<div class="test-badge">TEST / DEVELOPMENT<br><span>สำหรับทดสอบระบบเท่านั้น · มิใช่การสำเร็จการศึกษาจริง</span></div>` : ""}
    <div class="content">
      ${emblem(p)}
      <div class="issuer">${esc(issuer || BRAND)}</div>
      <h1>${esc(c.documentName)}</h1>
      <div class="kicker">${esc(certificateKicker(c.documentType))}</div>
      <div class="present">ให้ไว้เพื่อแสดงว่า</div>
      <div class="name">${esc(c.recipientName)}</div>
      ${divider(p, 140)}
      <div class="achieve">${esc(achievement)}</div>
      <div class="course">${esc(courseText)}</div>
      <div class="detail">${esc(detail)}</div>
      <div class="given">ให้ไว้ ณ วันที่ ${esc(formalThaiDate(c.issuedAt))}</div>
      ${c.expiresAt ? `<div class="expiry">มีผลถึงวันที่ ${esc(formalThaiDate(c.expiresAt))}</div>` : ""}
    </div>
    <div class="bottom">
      <div class="qr"><img src="${a.qrDataUrl}" alt=""><div class="t"><b>สแกนเพื่อตรวจสอบ</b>รหัสเอกสาร<br><span class="code">${esc(c.code)}</span></div></div>
      ${seal(p, thaiDigits(year), isTest)}
      ${showSigner
        ? `<div class="sign"><div class="line"></div><div class="n">${esc(c.signerName)}</div><div class="r">${c.signerTitle ? esc(c.signerTitle) : "ผู้ลงนาม"}</div></div>`
        : `<div class="attest"><b>รับรองด้วยลายมือชื่อดิจิทัล</b>เอกสารฉบับนี้ออกโดยระบบ ${esc(BRAND)}<br>ลงนามอิเล็กทรอนิกส์ด้วย Ed25519<br>ตรวจสอบความถูกต้องได้ด้วย QR Code</div>`}
    </div>
    <div class="foot">${isTest ? `<b style="color:#b91c1c">[TEST / DEVELOPMENT]</b> · ` : ""}เอกสารต้นฉบับดิจิทัล ลงนามด้วย Ed25519 · ตรวจสอบที่ ${esc(a.verifyUrl.replace(/^https?:\/\//, ""))} · ลายนิ้วมือภาพ <span class="digest">${esc(c.visualDigest || "-")}</span></div>
  </div></body></html>`;
}
