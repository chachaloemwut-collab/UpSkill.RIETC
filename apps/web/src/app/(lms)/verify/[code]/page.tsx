import type { Metadata } from "next";
import { headers } from "next/headers";
import { hitRateLimit, RATE_LIMITS } from "@upskill/infra/rate-limit";
import { ctx } from "@/server/context";
import { verifyPublicCertificate } from "@/server/certificates/verify.service";

// The page contains a person's name -> keep it out of search engines (PDPA: minimize exposure)
export const metadata: Metadata = { title: "ตรวจสอบใบรับรอง", robots: { index: false, follow: false } };

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const h = await headers();
  const ip = h.get("x-real-ip") ?? "0.0.0.0";
  const rl = await hitRateLimit(ctx().redis, RATE_LIMITS.verifyPublicPerIp, ip);
  if (!rl.allowed) return <Shell tone="amber" title="คำขอมากเกินไป" body="กรุณาลองใหม่ภายหลัง" />;

  const r = await verifyPublicCertificate(code);

  if (r.status === "not_found") return <Shell tone="gray" title="ไม่พบใบรับรอง" body="รหัสใบรับรองไม่ถูกต้องหรือไม่มีอยู่ในระบบ" />;
  if (r.status === "tampered")
    return <Shell tone="red" title="ไม่สามารถยืนยันความถูกต้องได้" body="ข้อมูลใบรับรองไม่ตรงกับลายเซ็นดิจิทัล กรุณาติดต่อผู้ดูแลระบบ" />;

  return (
    <main className="mx-auto max-w-xl p-4">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        {r.status === "valid" ? (
          <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 font-semibold text-green-800">✓ ใบรับรองถูกต้องและเป็นของจริง (Verified)</p>
        ) : (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-800">
            <p className="font-semibold">ใบรับรองนี้ถูกเพิกถอนแล้ว</p>
            <p className="text-sm">เหตุผล: {r.revokedReason}</p>
          </div>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-neutral-500">ผู้สำเร็จการศึกษา</dt>
          <dd className="font-medium">{r.recipientName}</dd>
          <dt className="text-neutral-500">หลักสูตร</dt>
          <dd>{r.courseTitle}</dd>
          <dt className="text-neutral-500">ผู้สอน</dt>
          <dd>{r.instructorName}</dd>
          <dt className="text-neutral-500">เวลาเรียนสะสมจริง</dt>
          <dd>{r.studyDurationText}</dd>
          <dt className="text-neutral-500">คะแนนสอบ</dt>
          <dd>{r.quizScore}%</dd>
          <dt className="text-neutral-500">ประเภทหลักสูตร</dt>
          <dd>{r.verifiedCourse ? "Verified Course" : "Community Course"}</dd>
          <dt className="text-neutral-500">ออกเมื่อ</dt>
          <dd>{new Date(r.issuedAt).toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" })}</dd>
          <dt className="text-neutral-500">รหัส</dt>
          <dd className="font-mono">{r.code}</dd>
        </dl>
      </section>
    </main>
  );
}

function Shell({ tone, title, body }: { tone: "gray" | "red" | "amber"; title: string; body: string }) {
  const color = { gray: "bg-neutral-50 text-neutral-800", red: "bg-red-50 text-red-800", amber: "bg-amber-50 text-amber-800" }[tone];
  return (
    <main className="mx-auto max-w-xl p-4">
      <section className={`rounded-2xl border p-6 ${color}`}>
        <h1 className="font-semibold">{title}</h1>
        <p className="mt-1 text-sm">{body}</p>
      </section>
    </main>
  );
}
