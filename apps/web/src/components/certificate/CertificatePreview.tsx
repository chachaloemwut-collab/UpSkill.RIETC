import { QrCode } from "lucide-react";
import { certificateKicker, certificatePattern } from "@upskill/core/certificate-patterns";

/**
 * Scaled-down HTML likeness of the PDF artwork (apps/worker/src/jobs/certificate-template.ts): same palette,
 * same layout, sample learner data. Sizes are in container-query units so it scales with the card width.
 */
export function CertificatePreview({
  template,
  align,
  documentType,
  documentName,
  achievement,
  courseTitle,
  signerName,
  signerTitle,
}: {
  template: string;
  align: string;
  documentType: string;
  documentName: string;
  achievement: string;
  courseTitle: string;
  signerName: string;
  signerTitle: string;
}) {
  const p = certificatePattern(template);
  const left = align === "left";
  const band = p.ornate
    ? `repeating-linear-gradient(45deg, ${p.inner}55 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, ${p.inner}55 0 1px, transparent 1px 5px)`
    : "none";
  const facts = [
    ["เวลาเรียนสะสมจริง", "2 ชั่วโมง 15 นาที"],
    ["คะแนนประเมิน", "92.50%"],
    ["วันที่ออก", "19 พฤศจิกายน 2569"],
  ];
  return (
    <div className="@container mx-auto w-full max-w-3xl">
      <div
        className="relative aspect-[297/210] w-full overflow-hidden rounded-md shadow-lg ring-1 ring-black/5"
        style={{ background: p.bg, color: p.ink, fontFamily: "var(--font-sarabun), sans-serif" }}
      >
        {/* Frame: outer rule, ornament band, inner gold rule */}
        <div className="absolute" style={{ inset: "2.4cqw", border: `0.38cqw solid ${p.frame}` }} />
        <div className="absolute" style={{ inset: "3.5cqw", backgroundImage: band, padding: "1.2cqw", mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", maskComposite: "exclude" }} />
        <div className="absolute" style={{ inset: "4.8cqw", border: `0.15cqw solid ${p.accent}` }} />

        <div
          className="absolute flex flex-col justify-center"
          style={{ left: "10cqw", right: "10cqw", top: "7cqw", bottom: "21cqw", textAlign: left ? "left" : "center" }}
        >
          <p style={{ fontSize: "1.05cqw", letterSpacing: "0.42em", color: p.muted, fontFamily: "var(--font-prompt)" }}>UPSKILLRESKILL.RIETC</p>
          <p style={{ fontSize: "1.3cqw", letterSpacing: "0.3em", color: p.accent, textTransform: "uppercase", marginTop: "0.9cqw", fontFamily: "var(--font-prompt)" }}>
            {certificateKicker(documentType)}
          </p>
          <p className="font-semibold" style={{ fontSize: "3.6cqw", lineHeight: 1.25, color: p.title, marginTop: "0.6cqw", fontFamily: "var(--font-prompt)" }}>
            {documentName || "เกียรติบัตร"}
          </p>
          <p style={{ fontSize: "1.6cqw", color: p.muted, marginTop: "1.8cqw" }}>ขอมอบให้แก่</p>
          <p className="font-semibold" style={{ fontSize: "4.2cqw", lineHeight: 1.3, fontFamily: "var(--font-prompt)" }}>
            นายสมชาย พัฒนาวิชาชีพ
          </p>
          <div
            style={{ height: "0.12cqw", width: "46cqw", background: p.accent, margin: left ? "0.4cqw 0 0" : "0.4cqw auto 0" }}
            aria-hidden
          />
          <p style={{ fontSize: "1.6cqw", marginTop: "1.1cqw" }}>{achievement || "ได้ผ่านการอบรมและการประเมินตามเกณฑ์"}</p>
          <p className="font-semibold" style={{ fontSize: "2.2cqw", color: p.title, marginTop: "0.4cqw", fontFamily: "var(--font-prompt)" }}>
            {documentType === "program" ? "หลักสูตรอบรม" : "หลักสูตร"} {courseTitle}
          </p>
          <div className="flex" style={{ justifyContent: left ? "flex-start" : "center", marginTop: "2cqw" }}>
            {facts.map(([k, v], i) => (
              <div
                key={k}
                style={{
                  padding: i === 0 && left ? "0 2cqw 0 0" : "0 2cqw",
                  borderLeft: i ? `0.1cqw solid ${p.accent}88` : undefined,
                  textAlign: left ? "left" : "center",
                }}
              >
                <p style={{ fontSize: "1.05cqw", color: p.muted }}>{k}</p>
                <p style={{ fontSize: "1.45cqw", fontFamily: "var(--font-prompt)" }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom row: QR · seal · signature */}
        <div className="absolute flex items-end justify-between" style={{ left: "8.8cqw", right: "8.8cqw", bottom: "8cqw" }}>
          <div className="flex items-end" style={{ gap: "1.2cqw" }}>
            <span className="flex items-center justify-center bg-white" style={{ width: "9cqw", height: "9cqw", border: `0.1cqw solid ${p.frame}40` }}>
              <QrCode style={{ width: "7cqw", height: "7cqw", color: p.ink }} />
            </span>
            <span style={{ fontSize: "1.05cqw", color: p.muted, lineHeight: 1.45 }}>
              <b className="block" style={{ color: p.title }}>สแกนเพื่อตรวจสอบ</b>
              UR-2026-XXXX-XXXX
            </span>
          </div>
          <svg viewBox="0 0 100 100" style={{ width: "13cqw", height: "13cqw", marginBottom: "-1.5cqw" }} aria-hidden>
            <circle cx="50" cy="50" r="47" fill="none" stroke={p.frame} strokeWidth="2" strokeDasharray="1.2 1.6" />
            <circle cx="50" cy="50" r="42" fill={p.bg} stroke={p.accent} strokeWidth="1" />
            <circle cx="50" cy="50" r="31" fill="none" stroke={p.accent} strokeWidth=".6" />
            <circle cx="50" cy="50" r="19" fill={p.frame} />
            <path d="M42.5,48.5 l4.6,4.6 l10,-10" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="text-center" style={{ width: "24cqw" }}>
            <div style={{ height: "0.1cqw", background: p.ink, opacity: 0.55, marginBottom: "0.7cqw" }} />
            <p className="font-semibold" style={{ fontSize: "1.6cqw", fontFamily: "var(--font-prompt)" }}>{signerName || "ผู้สอนประจำหลักสูตร"}</p>
            <p style={{ fontSize: "1.2cqw", color: p.muted }}>{signerTitle || "ผู้ลงนาม"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
