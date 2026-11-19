"use client";
import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Fingerprint,
  GraduationCap,
  Hash,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { Badge, Button, Card, buttonClass, useToast } from "@/components/ui";
import { formatDateTh } from "@/lib/format";
import { cn } from "@/lib/utils";

interface VerificationData {
  status: "valid" | "revoked" | "expired";
  code: string;
  recipientName: string;
  courseTitle: string;
  instructorName: string;
  studyDurationText: string;
  totalStudySec: number;
  quizScore: string;
  verifiedCourse: boolean;
  issuedAt: string;
  documentName: string;
  documentType: string;
  visualDigest: string;
  expiresAt?: string;
  revokedAt?: string;
  revokedReason?: string;
  isDevelopmentTest?: boolean;
  testNotice?: string;
}

export function DigitalSeal({ valid }: { valid: boolean }) {
  return (
    <div className="relative flex items-center justify-center p-2 select-none">
      <div
        className={cn(
          "relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full border-4 shadow-md transition-transform hover:scale-105",
          valid
            ? "border-emerald-500/80 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "border-destructive/80 bg-destructive/10 text-destructive"
        )}
      >
        {/* Inner concentric dotted ring */}
        <div className="absolute inset-1.5 rounded-full border border-dashed border-current opacity-40 animate-[spin_30s_linear_infinite]" />
        
        {/* Decorative Stars & Shield */}
        <div className="flex flex-col items-center justify-center text-center">
          {valid ? (
            <>
              <ShieldCheck className="h-8 w-8 sm:h-10 sm:w-10 drop-shadow-xs" />
              <span className="mt-1 font-mono text-[9px] font-bold tracking-widest uppercase">
                ED25519
              </span>
              <span className="text-[8px] font-semibold tracking-wider opacity-85">
                VERIFIED
              </span>
            </>
          ) : (
            <>
              <ShieldAlert className="h-8 w-8 sm:h-10 sm:w-10" />
              <span className="mt-1 font-mono text-[9px] font-bold tracking-widest uppercase">
                INVALID
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function VerificationTrustCard({ data }: { data: VerificationData }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  const valid = data.status === "valid";
  const expired = data.status === "expired";

  const copyUrl = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({ title: "คัดลอกลิงก์ตรวจสอบแล้ว", variant: "success" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyCode = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(data.code);
      setCopiedHash(true);
      toast({ title: "คัดลอกรหัสใบรับรองแล้ว", variant: "success" });
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  const rows = [
    { icon: UserRound, label: "ผู้สำเร็จการศึกษา", value: <span className="font-semibold text-foreground">{data.recipientName}</span> },
    { icon: BadgeCheck, label: "เอกสารรับรอง", value: `${data.documentName} (${data.documentType})` },
    { icon: GraduationCap, label: "หลักสูตร", value: <span className="font-medium text-foreground">{data.courseTitle}</span> },
    { icon: UserRound, label: "ผู้สอน / ผู้จัดทำ", value: data.instructorName },
    {
      icon: Clock,
      label: "เวลาเรียนสะสมจริง",
      value: (
        <span className="font-mono tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
          {data.studyDurationText}
        </span>
      ),
    },
    {
      icon: Target,
      label: "ผลการอบรม",
      // Public page: show the outcome, not the score (passing is what earns the document)
      value: <span className="font-semibold text-emerald-600 dark:text-emerald-400">ผ่านเกณฑ์ของหลักสูตร</span>,
    },
    {
      icon: BadgeCheck,
      label: "ประเภทหลักสูตร",
      value: data.verifiedCourse ? (
        <Badge variant="success" className="gap-1 font-semibold">
          <Sparkles className="h-3 w-3" /> Verified Course
        </Badge>
      ) : (
        <Badge variant="secondary">Community Course</Badge>
      ),
    },
    { icon: Clock, label: "วันที่ออกเอกสาร", value: formatDateTh(data.issuedAt, "long") },
    ...(data.expiresAt ? [{ icon: Clock, label: "วันหมดอายุ", value: formatDateTh(data.expiresAt, "long") }] : []),
    {
      icon: Hash,
      label: "รหัสใบรับรอง",
      value: (
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold tracking-wider text-foreground">{data.code}</span>
          <button
            type="button"
            onClick={copyCode}
            aria-label="คัดลอกรหัส"
            className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {copiedHash ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      ),
    },
    {
      icon: Fingerprint,
      label: "ลายนิ้วมือดิจิทัล (Digest)",
      value: <span className="font-mono text-xs text-muted-foreground break-all">{data.visualDigest || "—"}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl pt-2 sm:pt-6">
      <Card className="overflow-hidden border-border/80 shadow-md">
        {data.isDevelopmentTest && (
          <div className="border-b-2 border-dashed border-amber-500/80 bg-amber-500/15 p-4 text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>[TEST / DEVELOPMENT] เอกสารสำหรับทดสอบระบบ</span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-amber-800/90 dark:text-amber-200/90">
              {data.testNotice ??
                "ใบประกาศนียบัตรฉบับนี้ออกเพื่อการทดสอบทางเทคนิคของระบบ UpSkill.RIETC สำหรับบัญชีผู้พัฒนา โดยไม่มีผลรับรองการเรียนหรือการสอบผ่านจริง"}
            </p>
          </div>
        )}

        {/* Banner with Digital Seal */}
        <div
          className={cn(
            "p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-center justify-between gap-6 border-b",
            valid
              ? "bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent text-emerald-700 dark:text-emerald-300"
              : expired
                ? "bg-warning/10 text-warning"
                : "bg-destructive/10 text-destructive"
          )}
        >
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1.5">
                <Badge variant={valid ? "success" : expired ? "warning" : "destructive"} className="text-xs font-semibold">
                  {valid ? "✓ ตรวจสอบแล้ว ถูกต้อง 100%" : expired ? "หมดอายุการรับรอง" : "ถูกเพิกถอน"}
                </Badge>
                {data.isDevelopmentTest && (
                  <Badge variant="warning" className="text-xs font-semibold">
                    TEST / DEVELOPMENT
                  </Badge>
                )}
                {valid && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-300">
                    Ed25519 Verified
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {valid
                  ? `${data.documentName} ผ่านการตรวจสอบ`
                  : expired
                    ? `${data.documentName} หมดอายุแล้ว`
                    : `${data.documentName} ถูกเพิกถอนแล้ว`}
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                {valid
                  ? "ลายเซ็นดิจิทัลและข้อมูลการเรียนรู้ตรงกับฐานข้อมูลส่วนกลางทุกประการ"
                  : expired
                    ? `เอกสารนี้หมดอายุเมื่อ ${formatDateTh(data.expiresAt!, "long")}`
                    : `เหตุผลการเพิกถอน: ${data.revokedReason || "ไม่ระบุ"}`}
              </p>
            </div>
          </div>

          <DigitalSeal valid={valid} />
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-6 py-3 no-print">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyUrl} className="gap-1.5 text-xs">
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์ตรวจสอบ"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => typeof window !== "undefined" && window.print()}
              className="gap-1.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5" /> พิมพ์เอกสาร
            </Button>
          </div>
          <Link href="/catalog" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            ดูหลักสูตรทั้งหมด <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {/* Data Rows */}
        <dl className="divide-y divide-border/60 bg-card">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[auto_1fr] items-center gap-x-4 px-6 py-3.5 text-sm sm:grid-cols-[210px_1fr]"
            >
              <dt className="flex items-center gap-2 text-muted-foreground font-medium text-xs sm:text-sm">
                <row.icon className="h-4 w-4 shrink-0 text-muted-foreground/80" /> {row.label}
              </dt>
              <dd className="min-w-0 break-words text-xs sm:text-sm">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mt-6 flex items-center justify-center gap-4 no-print text-center">
        <Link href="/verify" className={buttonClass("ghost", "sm")}>
          ← ตรวจสอบใบรับรองอื่น
        </Link>
      </div>
    </div>
  );
}
