import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { BadgeCheck, CircleHelp, Clock, Fingerprint, GraduationCap, Hash, ShieldAlert, ShieldCheck, ShieldX, Target, UserRound } from "lucide-react";
import { hitRateLimit, RATE_LIMITS } from "@upskill/infra/rate-limit";
import { Badge, Card, buttonClass } from "@/components/ui";
import { formatDateTh } from "@/lib/format";
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
    return <Notice tone="muted" icon={<CircleHelp className="h-7 w-7" />} title="ไม่พบใบรับรอง" body="รหัสใบรับรองไม่ถูกต้องหรือไม่มีอยู่ในระบบ" />;
  if (r.status === "tampered")
    return (
      <Notice tone="destructive" icon={<ShieldX className="h-7 w-7" />} title="ไม่สามารถยืนยันความถูกต้องได้" body="ข้อมูลใบรับรองไม่ตรงกับลายเซ็นดิจิทัล กรุณาติดต่อผู้ดูแลระบบ" />
    );

  const valid = r.status === "valid";
  const expired = r.status === "expired";
  const rows = [
    { icon: UserRound, label: "ผู้สำเร็จการศึกษา", value: <span className="font-semibold">{r.recipientName}</span> },
    { icon: BadgeCheck, label: "เอกสาร", value: `${r.documentName} (${r.documentType})` },
    { icon: GraduationCap, label: "หลักสูตร", value: r.courseTitle },
    { icon: UserRound, label: "ผู้สอน", value: r.instructorName },
    { icon: Clock, label: "เวลาเรียนสะสมจริง", value: r.studyDurationText },
    { icon: Target, label: "คะแนนสอบ", value: `${r.quizScore}%` },
    {
      icon: BadgeCheck,
      label: "ประเภทหลักสูตร",
      value: r.verifiedCourse ? <Badge variant="success">Verified Course</Badge> : <Badge variant="secondary">Community Course</Badge>,
    },
    { icon: Clock, label: "ออกเมื่อ", value: formatDateTh(r.issuedAt, "long") },
    ...(r.expiresAt ? [{ icon: Clock, label: "ใช้ได้ถึง", value: formatDateTh(r.expiresAt, "long") }] : []),
    { icon: Hash, label: "รหัส", value: <span className="font-mono">{r.code}</span> },
    { icon: Fingerprint, label: "ลายนิ้วมือภาพ", value: <span className="font-mono">{r.visualDigest || "—"}</span> },
  ];

  return (
    <div className="mx-auto max-w-2xl pt-2 sm:pt-6">
      <Card className="overflow-hidden">
        <div className={valid ? "flex items-center gap-4 bg-success/10 p-6 text-success" : expired ? "flex items-center gap-4 bg-warning/10 p-6 text-warning" : "flex items-center gap-4 bg-destructive/10 p-6 text-destructive"}>
          <span className="flex h-14 w-14 shrink-0 animate-spring-in items-center justify-center rounded-full bg-background shadow-sm">
            {valid ? <ShieldCheck className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
          </span>
          <div>
            <p className="text-lg font-semibold">{valid ? `${r.documentName}ผ่านการตรวจสอบ` : expired ? `${r.documentName}หมดอายุแล้ว` : `${r.documentName}ถูกเพิกถอนแล้ว`}</p>
            <p className="text-sm opacity-80">{valid ? "ลายเซ็นดิจิทัลตรงกับข้อมูลในระบบ" : expired ? `หมดอายุเมื่อ ${formatDateTh(r.expiresAt!, "long")}` : `เหตุผล: ${r.revokedReason}`}</p>
          </div>
        </div>
        <dl className="divide-y">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[auto_1fr] items-center gap-x-4 px-6 py-3.5 text-sm sm:grid-cols-[200px_1fr]">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <row.icon className="h-4 w-4" /> {row.label}
              </dt>
              <dd className="min-w-0 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <div className="mt-4 text-center">
        <Link href="/verify" className={buttonClass("ghost", "sm")}>
          ตรวจสอบใบรับรองอื่น
        </Link>
      </div>
    </div>
  );
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
