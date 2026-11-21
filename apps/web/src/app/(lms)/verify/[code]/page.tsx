import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { CircleHelp, Clock, ShieldX } from "lucide-react";
import { hitRateLimit, RATE_LIMITS } from "@upskill/infra/rate-limit";
import { Card, buttonClass } from "@/components/ui";
import { VerificationTrustCard } from "@/components/certificate/VerificationTrustCard";
import { ctx } from "@/server/context";
import { verifyPublicCertificate } from "@/server/certificates/verify.service";

// The page contains a person's name -> keep it out of search engines (PDPA: minimize exposure)
export const metadata: Metadata = { title: "ผลการตรวจสอบเอกสารรับรอง", robots: { index: false, follow: false } };

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const h = await headers();
  const ip = h.get("x-real-ip") ?? "0.0.0.0";
  const rl = await hitRateLimit(ctx().redis, RATE_LIMITS.verifyPublicPerIp, ip);
  if (!rl.allowed) return <Notice tone="warning" icon={<Clock className="h-7 w-7" />} title="คำขอมากเกินไป" body="กรุณาลองใหม่ภายหลัง" />;

  const r = await verifyPublicCertificate(code);

  if (r.status === "not_found")
    return <Notice tone="muted" icon={<CircleHelp className="h-7 w-7" />} title="ไม่พบวุฒิบัตร" body="รหัสวุฒิบัตรไม่ถูกต้องหรือไม่มีอยู่ในระบบ" />;
  if (r.status === "tampered")
    return (
      <Notice tone="destructive" icon={<ShieldX className="h-7 w-7" />} title="ไม่สามารถยืนยันความถูกต้องได้" body="ข้อมูลวุฒิบัตรไม่ตรงกับลายเซ็นดิจิทัล กรุณาติดต่อผู้ดูแลระบบ" />
    );

  return <VerificationTrustCard data={r} />;
}

function Notice({ tone, icon, title, body }: { tone: "muted" | "destructive" | "warning"; icon: React.ReactNode; title: string; body: string }) {
  const color = { muted: "bg-muted text-muted-foreground", destructive: "bg-destructive/10 text-destructive", warning: "bg-warning/10 text-warning" }[tone];
  return (
    <div className="mx-auto max-w-md pt-6 sm:pt-12">
      <Card className="grid justify-items-center gap-3 p-8 text-center">
        <span className={`flex h-14 w-14 items-center justify-center rounded-full ${color}`}>{icon}</span>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        <Link href="/verify" className={buttonClass("outline", "md", "mt-2")}>
          ลองรหัสอื่น
        </Link>
      </Card>
    </div>
  );
}
