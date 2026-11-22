"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, Copy, ExternalLink, Eye, FileSpreadsheet, Plus, RotateCcw, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import {
  AdvancedDataTable,
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  buttonClass,
  useToast,
  type Column,
  type TableView,
} from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { formatDateTh, formatDuration } from "@/lib/format";
import { api } from "@/lib/api";
import { DownloadCertificateButton } from "@/components/course/CertificatePanel";

// A type alias (not an interface) so it satisfies the table's Record<string, unknown> row constraint
export type CertificateRow = {
  id: string;
  certificate_code: string;
  recipient_name_snapshot: string;
  course_title_snapshot: string;
  instructor_name_snapshot: string;
  total_actual_study_sec: number;
  quiz_score_snapshot: string;
  is_verified_course_snapshot: boolean;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  document_name_snapshot: string;
  document_type_snapshot: string;
  user_id: string;
  user_email: string;
  course_id: string | null;    // null for program-level certificates
  course_slug: string | null;
  status: "valid" | "expired" | "revoked";
};

export interface CertificatesManagerProps {
  initialData: {
    certificates: CertificateRow[];
    counts: { total: number; valid: number; expired: number; revoked: number };
    total: number;
  };
  courses: { id: string; title: string; slug: string; visibility: string }[];
  initialQuery?: string;
  initialStatus?: string;
  /** Title of the course the page was opened for (?course=…), or null for every course */
  courseId: string | null;
  courseFilter?: string | null;
  limit: number;
}

const STATUS_LABEL: Record<CertificateRow["status"], string> = { valid: "ใช้งานได้", expired: "หมดอายุ", revoked: "ถูกเพิกถอน" };

const VIEWS: TableView[] = [
  { name: "ใช้งานได้", state: { filters: { status: { kind: "enum", values: ["valid"] } } } },
  { name: "ถูกเพิกถอน", state: { filters: { status: { kind: "enum", values: ["revoked"] } } } },
  { name: "ออก 30 วันล่าสุด", state: { filters: { issued_at: { kind: "date", op: "between", preset: "30d" } } } },
];

/**
 * Admin certificate register, laid out like the OVEC (vec-day01) admin template: page header with the main actions,
 * KPI tiles that also filter, and the template's AdvancedDataTable (search, per-column filters, sort, column
 * show/hide/pin, saved views, paging) inside a card. Row actions stay on the row as labelled icon buttons.
 */
export function CertificatesManager({ initialData, courses, initialQuery = "", initialStatus = "", courseId, courseFilter = null, limit }: CertificatesManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const target = Math.min(initialData.total, limit);
  const initialBatch = { source: initialData, rows: initialData.certificates, done: false, failed: false };
  const [batch, setBatch] = useState(initialBatch);
  if (batch.source !== initialData) setBatch(initialBatch);
  const last = batch.rows.at(-1)?.id;
  const remaining = target - batch.rows.length;

  useEffect(() => {
    if (batch.source !== initialData || !last || remaining <= 0 || batch.done || batch.failed) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ after: last });
    if (courseId) params.set("course", courseId);
    async function loadMore() {
      try {
        const response = await fetch(`/api/admin/certificates?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Could not load register");
        const { certificates }: { certificates: CertificateRow[] } = await response.json();
        if (!controller.signal.aborted) setBatch(current => current.source !== initialData ? current : {
          ...current, rows: [...current.rows, ...certificates.slice(0, remaining)], done: certificates.length === 0,
        });
      } catch {
        if (!controller.signal.aborted) setBatch(current => current.source !== initialData ? current : { ...current, failed: true });
      }
    }
    void loadMore();
    return () => controller.abort();
  }, [batch.source, batch.done, batch.failed, courseId, initialData, last, remaining]);

  // Revoke Dialog State
  const [revokeCert, setRevokeCert] = useState<CertificateRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);

  // Manual Issue Dialog State
  const [issueOpen, setIssueOpen] = useState(false);
  const [userIdInput, setUserIdInput] = useState("");
  const [courseIdInput, setCourseIdInput] = useState(courses[0]?.id ?? "");
  const [scoreInput, setScoreInput] = useState("100");
  const [reasonInput, setReasonInput] = useState("ออกวุฒิบัตรกรณีพิเศษ / เทียบโอนผลการเรียน");
  const [issuing, setIssuing] = useState(false);

  // A KPI tile re-opens the table with that status filter (the key remounts it with the new starting state)
  const [statusView, setStatusView] = useState(["valid", "expired", "revoked"].includes(initialStatus) ? initialStatus : "");

  const copy = (code: string) => {
    void navigator.clipboard.writeText(code).then(
      () => toast({ title: "คัดลอกรหัสแล้ว", description: code, variant: "success" }),
      () => toast({ title: "คัดลอกไม่สำเร็จ", description: code, variant: "destructive" }),
    );
  };

  const courseOptions = useMemo(
    () => [...new Set(batch.rows.map((c) => c.course_title_snapshot))].sort((a, b) => a.localeCompare(b, "th")).map((t) => ({ value: t, label: t })),
    [batch.rows],
  );

  const columns: Column<CertificateRow>[] = [
    {
      key: "certificate_code",
      header: "รหัสวุฒิบัตร",
      sortable: true,
      filter: "text",
      hideable: false,
      render: (c) => (
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="font-mono text-xs font-semibold text-primary">{c.certificate_code}</span>
            <button type="button" onClick={() => copy(c.certificate_code)} aria-label={`คัดลอกรหัส ${c.certificate_code}`} title="คัดลอกรหัส" className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </span>
          {c.document_type_snapshot === "development_test" && <Badge variant="warning" className="w-fit text-[10px]">ทดสอบระบบ</Badge>}
        </div>
      ),
    },
    {
      key: "recipient_name_snapshot",
      header: "ผู้ได้รับ",
      sortable: true,
      filter: "text",
      render: (c) => (
        <div className="min-w-0">
          <Link href={`/admin/users/${c.user_id}`} className="font-medium hover:underline">{c.recipient_name_snapshot}</Link>
          <div className="max-w-[12rem] truncate text-xs text-muted-foreground" title={c.user_email}>{c.user_email}</div>
        </div>
      ),
    },
    {
      key: "course_title_snapshot",
      header: "หลักสูตร",
      sortable: true,
      filter: "enum",
      options: courseOptions,
      render: (c) => (
        <div className="min-w-0 max-w-[11rem]">
          <div className="truncate font-medium" title={c.course_title_snapshot}>{c.course_title_snapshot}</div>
          <div className="truncate text-xs text-muted-foreground">ผู้สอน {c.instructor_name_snapshot}</div>
        </div>
      ),
    },
    {
      key: "issued_at",
      header: "วันที่ออก",
      sortable: true,
      filter: "date",
      accessor: (c) => c.issued_at,
      render: (c) => (
        <div className="whitespace-nowrap">
          <div>{formatDateTh(c.issued_at)}</div>
          <div className="text-xs text-muted-foreground">{c.expires_at ? `หมดอายุ ${formatDateTh(c.expires_at)}` : "ไม่มีวันหมดอายุ"}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      sortable: true,
      filter: "enum",
      options: [
        { value: "valid", label: "ใช้งานได้" },
        { value: "expired", label: "หมดอายุ" },
        { value: "revoked", label: "ถูกเพิกถอน" },
      ],
      render: (c) => (
        <div className="flex flex-col gap-1">
          <Badge variant={c.status === "valid" ? "success" : c.status === "expired" ? "warning" : "destructive"} className="w-fit gap-1">
            {c.status === "valid" ? <ShieldCheck className="h-3 w-3" /> : c.status === "expired" ? <RotateCcw className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {STATUS_LABEL[c.status]}
          </Badge>
          {c.revoked_reason && <span className="max-w-[9rem] truncate text-xs text-destructive" title={c.revoked_reason}>{c.revoked_reason}</span>}
        </div>
      ),
    },
    {
      key: "total_actual_study_sec",
      header: "เวลาเรียน",
      sortable: true,
      filter: "number",
      align: "right",
      render: (c) => <span className="whitespace-nowrap tabular-nums">{formatDuration(c.total_actual_study_sec)}</span>,
    },
    {
      key: "id",
      header: "จัดการ",
      align: "right",
      hideable: false,
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          {c.status !== "revoked" && (
            <a
              href={`/api/certificates/${encodeURIComponent(c.certificate_code)}/download?inline=1`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("ghost", "icon", "h-8 w-8")}
              aria-label={`เปิดดูวุฒิบัตร ${c.certificate_code}`}
              title="เปิดดูไฟล์ PDF"
            >
              <Eye className="h-4 w-4" />
            </a>
          )}
          <DownloadCertificateButton code={c.certificate_code} variant="outline" size="sm" compact />
          <Link href={`/verify/${encodeURIComponent(c.certificate_code)}`} target="_blank" className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="หน้าตรวจสอบสาธารณะ" title="หน้าตรวจสอบสาธารณะ">
            <ExternalLink className="h-4 w-4" />
          </Link>
          {c.status !== "revoked" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`เพิกถอนวุฒิบัตร ${c.certificate_code}`}
              title="เพิกถอนวุฒิบัตร"
              onClick={() => {
                setRevokeCert(c);
                setRevokeReason("");
              }}
            >
              <ShieldAlert className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const submitRevoke = async () => {
    if (!revokeCert) return;
    if (revokeReason.trim().length < 5) {
      toast({ variant: "destructive", title: "ระบุเหตุผลอย่างน้อย 5 ตัวอักษร", description: "เหตุผลจะแสดงในหน้าตรวจสอบและบันทึกประวัติ" });
      return;
    }
    setRevoking(true);
    try {
      const res = await api(`/api/admin/certificates/${encodeURIComponent(revokeCert.certificate_code)}/revoke`, { method: "POST", body: { reason: revokeReason.trim() } });
      if (!res.ok) {
        toast({ variant: "destructive", title: "เพิกถอนไม่สำเร็จ", description: res.message });
        return;
      }
      toast({ title: "เพิกถอนแล้ว", description: `วุฒิบัตร ${revokeCert.certificate_code}`, variant: "success" });
      setRevokeCert(null);
      setRevokeReason("");
      router.refresh();
    } finally {
      setRevoking(false);
    }
  };

  const submitManualIssue = async () => {
    if (!userIdInput.trim()) {
      toast({ variant: "destructive", title: "ระบุ User ID ของผู้เรียน", description: "คัดลอกได้จากหน้ารายละเอียดสมาชิก" });
      return;
    }
    if (!courseIdInput) {
      toast({ variant: "destructive", title: "เลือกหลักสูตร" });
      return;
    }
    const scoreText = scoreInput.trim();
    const score = scoreText === "" ? NaN : Number(scoreText);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      toast({ variant: "destructive", title: "คะแนนไม่ถูกต้อง", description: "กรอกคะแนน 0–100 (0 เป็นคะแนนจริง ไม่ใช่ค่าว่าง)" });
      return;
    }
    setIssuing(true);
    try {
      const res = await api<{ code: string }>("/api/admin/certificates", { method: "POST", body: { userId: userIdInput.trim(), courseId: courseIdInput, score, reason: reasonInput.trim() } });
      if (!res.ok) {
        toast({ variant: "destructive", title: "ออกวุฒิบัตรไม่สำเร็จ", description: res.message });
        return;
      }
      toast({ title: "ออกวุฒิบัตรแล้ว", description: `รหัสวุฒิบัตร ${res.data.code}`, variant: "success" });
      setIssueOpen(false);
      setUserIdInput("");
      router.refresh();
    } finally {
      setIssuing(false);
    }
  };

  const { counts } = initialData;
  const tiles: Array<{ key: string; label: string; value: number; icon: React.ReactNode; tone: "primary" | "success" | "warning" | "info" }> = [
    { key: "", label: "วุฒิบัตรทั้งหมด", value: counts.total, icon: <Award />, tone: "primary" },
    { key: "valid", label: "ใช้งานได้", value: counts.valid, icon: <ShieldCheck />, tone: "success" },
    { key: "expired", label: "หมดอายุ", value: counts.expired, icon: <RotateCcw />, tone: "warning" },
    { key: "revoked", label: "ถูกเพิกถอน", value: counts.revoked, icon: <XCircle />, tone: "info" },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title="จัดการวุฒิบัตร" description="ค้นหา ตรวจสอบ ดาวน์โหลด เพิกถอน หรือออกวุฒิบัตรเป็นกรณีพิเศษ">
        <Link href="/admin/reports" className={buttonClass("outline", "md")}>
          <FileSpreadsheet className="h-4 w-4" /> รายงาน / ส่งออก
        </Link>
        <Button onClick={() => setIssueOpen(true)}>
          <Plus className="h-4 w-4" /> ออกวุฒิบัตรด้วยตนเอง
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {tiles.map((t, i) => (
          <button
            key={t.key || "all"}
            type="button"
            onClick={() => setStatusView(t.key)}
            aria-pressed={statusView === t.key}
            className={`rounded-lg text-left ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${statusView === t.key ? "ring-2 ring-primary" : ""}`}
          >
            <StatCard label={t.label} value={t.value} unit="ฉบับ" icon={t.icon} tone={t.tone} index={i} />
          </button>
        ))}
      </div>

      {courseFilter && (
        <Alert variant="default" title={`แสดงเฉพาะหลักสูตร “${courseFilter}”`}>
          <Link href="/admin/certificates" className="font-medium text-primary hover:underline">ดูวุฒิบัตรทุกหลักสูตร</Link>
        </Alert>
      )}
      {remaining > 0 && !batch.done && <div className="flex items-center gap-3 py-2 text-sm" role="status">
        {batch.failed ? <>โหลดรายการถัดไปไม่สำเร็จ <Button size="sm" variant="outline" onClick={() => setBatch(current => ({ ...current, failed: false }))}>ลองอีกครั้ง</Button></>
          : <>กำลังโหลดทะเบียน {batch.rows.length.toLocaleString("th-TH")} จาก {target.toLocaleString("th-TH")} ฉบับ</>}
      </div>}
      {initialData.total > limit && (
        <Alert variant="warning" title={`แสดง ${limit.toLocaleString("th-TH")} ฉบับล่าสุด จากทั้งหมด ${initialData.total.toLocaleString("th-TH")} ฉบับ`}>
          ใช้หน้ารายงานเพื่อส่งออกทั้งหมด หรือเปิดจากหลักสูตรเพื่อดูเฉพาะหลักสูตรนั้น
        </Alert>
      )}

      <Card className="p-5">
        <AdvancedDataTable
          key={statusView}
          data={batch.rows}
          columns={columns}
          rowKey="id"
          pageSize={20}
          searchKeys={["certificate_code", "recipient_name_snapshot", "user_email", "course_title_snapshot"]}
          searchPlaceholder="ค้นหารหัส ชื่อ อีเมล หรือหลักสูตร…"
          itemLabel="ฉบับ"
          emptyText="ไม่พบวุฒิบัตรตามเงื่อนไขนี้"
          defaultState={{
            query: initialQuery,
            hidden: ["total_actual_study_sec"],
            sort: { key: "issued_at", dir: -1 },
            ...(statusView ? { filters: { status: { kind: "enum", values: [statusView] } } } : {}),
          }}
          views={VIEWS}
          viewsStorageKey="upskill:admin-certificates-views"
        />
      </Card>

      {/* Revocation Modal */}
      <Dialog
        open={!!revokeCert}
        onOpenChange={(open) => !open && setRevokeCert(null)}
        title="เพิกถอนวุฒิบัตร"
        description="การเพิกถอนวุฒิบัตรจะทำให้สถานะในระบบสาธารณะกลายเป็น ถูกเพิกถอน (REVOKED) ทันที และส่งอีเมลแจ้งผู้เรียน"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" disabled={revoking} onClick={() => setRevokeCert(null)}>
              ยกเลิก
            </Button>
            <Button variant="destructive" loading={revoking} onClick={submitRevoke}>
              ยืนยันการเพิกถอน
            </Button>
          </div>
        }
      >
        {revokeCert && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted p-3 text-xs space-y-1">
              <div><span className="font-semibold">รหัส:</span> {revokeCert.certificate_code}</div>
              <div><span className="font-semibold">ผู้เรียน:</span> {revokeCert.recipient_name_snapshot} ({revokeCert.user_email})</div>
              <div><span className="font-semibold">หลักสูตร:</span> {revokeCert.course_title_snapshot}</div>
            </div>

            <Field label="เหตุผลในการเพิกถอน (แสดงในหน้าตรวจสอบและบันทึกประวัติ)">
              <Textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="เช่น ตรวจพบการทุจริตเวลาเรียน, ออกเอกสารผิดพลาด, หรือเพิกถอนตามคำร้องขอของหน่วยงาน…"
                rows={3}
              />
            </Field>
          </div>
        )}
      </Dialog>

      {/* Manual Issue Modal */}
      <Dialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        title="ออกวุฒิบัตรด้วยตนเอง (Manual Issue)"
        description="สำหรับกรณีผู้เรียนผ่านการทดสอบภาคปฏิบัติภายนอก เทียบโอนผลการเรียน หรือการออกวุฒิบัตรเป็นกรณีพิเศษโดยผู้ดูแลระบบ"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" disabled={issuing} onClick={() => setIssueOpen(false)}>
              ยกเลิก
            </Button>
            <Button loading={issuing} onClick={submitManualIssue}>
              ออกวุฒิบัตรทันที
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <Field label="User ID ของผู้เรียน (คัดลอกจากหน้ารายละเอียดสมาชิก)">
            <Input
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="01932345-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </Field>

          <Field label="หลักสูตรที่ต้องการออกวุฒิบัตร">
            <Select
              value={courseIdInput}
              onChange={(e) => setCourseIdInput(e.target.value)}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.visibility === "published" ? "เผยแพร่" : c.visibility === "archived" ? "เข้าคลัง" : c.visibility})
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="คะแนนสอบ (%)">
              <Input
                type="number"
                min="0"
                max="100"
                value={scoreInput}
                onChange={(e) => setScoreInput(e.target.value)}
              />
            </Field>

            <Field label="เหตุผล / บันทึกการออก">
              <Input
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="เทียบโอนผลการเรียน"
              />
            </Field>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
