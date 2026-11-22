import { QrCode } from "lucide-react";
import {
  CERTIFICATE_DISPLAY_DEFAULTS,
  CERTIFICATE_INTRO,
  CERTIFICATE_TITLE,
  certificateAchievement,
  DEFAULT_ISSUER_EN,
  DEFAULT_ISSUER_TH,
  certificateKicker,
  certificatePattern,
  formalThaiDate,
  thaiDigits,
  type CertificateDisplay,
} from "@upskill/core/certificate-patterns";
import { cn } from "@/lib/utils";

const BRAND = "UpskillReskill.RIETC";

/** Real learner data for an issued document; omitted fields fall back to sample values (editor/landing previews). */
export interface CertificatePreviewRecord {
  recipientName: string;
  studyText: string;
  issuedAt: string | Date;
  expiresAt?: string | Date | null;
  code: string;
  qrDataUrl?: string;
}

/**
 * Scaled-down HTML likeness of the PDF artwork (apps/worker/src/jobs/certificate-template.ts): same palette,
 * wording and layout. Sizes are in container-query units so it scales with its box (also when printed).
 */
export function CertificatePreview({
  template,
  backgroundUrl,
  documentType,
  courseTitle,
  signerName,
  signerTitle,
  display = CERTIFICATE_DISPLAY_DEFAULTS,
  signatureUrl,
  record,
  className,
}: {
  template: string;
  align?: string;
  backgroundUrl?: string | null;
  documentType: string;
  /** Kept for callers; the printed title/sentence are the fixed วุฒิบัตร wording (CERTIFICATE_TITLE) */
  documentName?: string;
  achievement?: string | null;
  courseTitle: string;
  signerName?: string | null;
  signerTitle?: string | null;
  display?: CertificateDisplay;
  /** Signature image URL; without it no signer name is shown (same rule as the PDF) */
  signatureUrl?: string | null;
  record?: CertificatePreviewRecord;
  className?: string;
}) {
  const p = certificatePattern(template);
  const isTest = documentType === "development_test";
  const issuer = display.issuer_name.trim();
  const showSigner = !!signatureUrl && !!signerName?.trim();
  const r: CertificatePreviewRecord = record ?? {
    recipientName: "นายสมชาย พัฒนาวิชาชีพ",
    studyText: "2 ชั่วโมง 15 นาที",
    issuedAt: new Date(),
    code: "UR-2026-XXXX-XXXX",
  };
  const issued = new Date(r.issuedAt);
  const year = formalThaiDate(issued).split(" ").at(-1) ?? "";
  const band = p.ornate
    ? `repeating-linear-gradient(45deg, ${p.inner}55 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, ${p.inner}55 0 1px, transparent 1px 5px)`
    : "none";
  const prompt = "var(--font-prompt), sans-serif";

  return (
    <div className={cn("@container mx-auto w-full", className)}>
      <div
        className="relative aspect-[297/210] w-full overflow-hidden rounded-md shadow-lg ring-1 ring-black/5 print:rounded-none print:shadow-none print:ring-0"
        style={{ background: p.bg, color: p.ink, fontFamily: "var(--font-sarabun), sans-serif", printColorAdjust: "exact" }}
      >
        {backgroundUrl?.startsWith("https://") && (
          // eslint-disable-next-line @next/next/no-img-element -- optional course artwork
          <img src={backgroundUrl} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover opacity-[.16]" />
        )}
        <div aria-hidden className="absolute inset-x-0 top-1/2 -rotate-[18deg] text-center opacity-[.085]" style={{ fontSize: "1.75cqw", letterSpacing: ".18em" }}>{BRAND} · {r.code}</div>
        <div className="absolute flex items-center font-semibold" style={{ left: "7.4cqw", top: "6.7cqw", fontSize: "0.85cqw", gap: ".65cqw", color: p.frame }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- print brand mark */}
          <img src="/favicon.svg" alt="" style={{ width: "3cqw", height: "3cqw" }} />{BRAND}
        </div>
        {/* Frame: outer rule, ornament band, inner gold rule */}
        <div className="absolute" style={{ inset: "2.4cqw", border: `0.38cqw solid ${p.frame}` }} />
        <div className="absolute" style={{ inset: "3.5cqw", backgroundImage: band, padding: "1.2cqw", mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", maskComposite: "exclude" }} />
        <div className="absolute" style={{ inset: "4.8cqw", border: `0.15cqw solid ${p.accent}` }} />

        {isTest && (
          <div className="absolute rounded-sm border-2 border-dashed border-red-700 bg-red-50 text-center font-bold text-red-700" style={{ top: "6.4cqw", right: "7.4cqw", fontSize: "1.3cqw", padding: "0.4cqw 1.4cqw" }}>
            TEST / DEVELOPMENT
          </div>
        )}

        <div
          className="absolute flex flex-col justify-center"
          style={{ left: "10cqw", right: "10cqw", top: "5.6cqw", bottom: "19.2cqw", textAlign: "center", alignItems: "center" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static emblem, same file the PDF embeds */}
          <img src="/brand/rietc-emblem.png" alt="" style={{ width: "7.6cqw", height: "7.6cqw", objectFit: "contain" }} />
          <p className="font-semibold" style={{ fontSize: "1.95cqw", lineHeight: 1.25, fontFamily: prompt, marginTop: "0.6cqw" }}>{issuer}</p>
          {issuer === DEFAULT_ISSUER_TH && (
            <p style={{ fontSize: "0.95cqw", letterSpacing: "0.3em", textTransform: "uppercase", color: p.muted, fontFamily: prompt }}>{DEFAULT_ISSUER_EN}</p>
          )}
          <p className="font-semibold" style={{ fontSize: "3.9cqw", lineHeight: 1.2, color: p.title, fontFamily: prompt, marginTop: "0.8cqw" }}>
            {CERTIFICATE_TITLE}
          </p>
          <p style={{ fontSize: "1.2cqw", letterSpacing: "0.34em", color: p.accent, textTransform: "uppercase", fontFamily: prompt, marginTop: "0.2cqw" }}>
            {certificateKicker(documentType)}
          </p>
          <p style={{ fontSize: "1.8cqw", marginTop: "1.2cqw" }}>{CERTIFICATE_INTRO}</p>
          <p className="font-semibold" style={{ fontSize: r.recipientName.length > 30 ? "3.4cqw" : "4.2cqw", lineHeight: 1.3, fontFamily: prompt }}>
            {r.recipientName}
          </p>
          <div style={{ height: "0.12cqw", width: "46cqw", background: p.accent, marginTop: "0.3cqw" }} aria-hidden />
          <p style={{ fontSize: "1.8cqw", marginTop: "0.7cqw" }}>{certificateAchievement(documentType)}</p>
          <p className="font-semibold" style={{ fontSize: courseTitle.length > 60 ? "1.9cqw" : "2.4cqw", lineHeight: 1.35, color: p.title, fontFamily: prompt }}>
            หลักสูตร {courseTitle}
          </p>
          <p style={{ fontSize: "1.6cqw", color: p.muted, marginTop: "0.7cqw" }}>
            {isTest
              ? "เอกสารสำหรับทดสอบระบบ ไม่มีเวลาเรียนจริง"
              : `จำนวนชั่วโมงการอบรม ${thaiDigits(r.studyText)}`}
          </p>
          <p style={{ fontSize: "1.7cqw", fontFamily: prompt, marginTop: "1.1cqw" }}>ให้ไว้ ณ วันที่ {formalThaiDate(issued)}</p>
          {r.expiresAt && <p style={{ fontSize: "1.3cqw", color: p.muted }}>มีผลถึงวันที่ {formalThaiDate(new Date(r.expiresAt))}</p>}
        </div>

        {/* Bottom row: QR · seal · signer or system attestation */}
        <div className="absolute" style={{ left: "8.8cqw", right: "8.8cqw", bottom: "8cqw", height: "12cqw" }}>
          <div className="absolute bottom-0 left-0 flex items-end" style={{ gap: "1.2cqw" }}>
            <span className="flex items-center justify-center bg-white" style={{ width: "8.8cqw", height: "8.8cqw", border: `0.1cqw solid ${p.frame}40` }}>
              {r.qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- QR generated from this issued record
                <img src={r.qrDataUrl} alt="รหัสตรวจสอบวุฒิบัตร" style={{ width: "8.3cqw", height: "8.3cqw" }} />
              ) : <QrCode aria-label="รหัสตัวอย่าง" style={{ width: "7cqw", height: "7cqw", color: p.ink }} />}
            </span>
            <span style={{ fontSize: "1.1cqw", color: p.muted, lineHeight: 1.45 }}>
              <b className="block" style={{ color: p.title, fontFamily: prompt }}>สแกนเพื่อตรวจสอบ</b>
              รหัสเอกสาร
              <span className="block font-mono" style={{ color: p.ink }}>{r.code}</span>
            </span>
          </div>
          <svg viewBox="0 0 100 100" className="absolute left-1/2 -translate-x-1/2" style={{ width: "13.4cqw", height: "13.4cqw", bottom: "-1.4cqw" }} aria-hidden>
            <circle cx="50" cy="50" r="47" fill="none" stroke={p.frame} strokeWidth="2" strokeDasharray="1.2 1.6" />
            <circle cx="50" cy="50" r="42" fill={p.bg} stroke={p.accent} strokeWidth="1" />
            <circle cx="50" cy="50" r="31" fill="none" stroke={p.accent} strokeWidth=".6" />
            <circle cx="50" cy="50" r="19" fill={isTest ? "#b91c1c" : p.frame} />
            <path d="M42.5,46.5 l4.6,4.6 l10,-10" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <text x="50" y="60.5" textAnchor="middle" fontSize="5.4" fontWeight="600" fill="#fff" style={{ fontFamily: prompt }}>{year}</text>
          </svg>
          {showSigner ? (
            <div className="absolute bottom-0 right-0 text-center" style={{ width: "24cqw" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked image */}
              <img src={signatureUrl!} alt="" className="mx-auto block object-contain" style={{ height: "5cqw", maxWidth: "20cqw", marginBottom: "-0.3cqw" }} />
              <div style={{ height: "0.1cqw", background: p.ink, opacity: 0.55, marginBottom: "0.7cqw" }} />
              <p className="font-semibold" style={{ fontSize: "1.65cqw", fontFamily: prompt }}>({signerName})</p>
              <p style={{ fontSize: "1.25cqw", color: p.muted }}>{signerTitle || "ผู้ลงนาม"}</p>
            </div>
          ) : (
            <div className="absolute bottom-0 right-0 text-right" style={{ width: "24cqw", fontSize: "1.1cqw", lineHeight: 1.5, color: p.muted }}>
              <b className="block" style={{ color: p.title, fontFamily: prompt }}>รับรองด้วยลายมือชื่อดิจิทัล</b>
              เอกสารฉบับนี้ออกผ่านระบบ {BRAND}
              <br />
              ลงนามอิเล็กทรอนิกส์ด้วย Ed25519
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
