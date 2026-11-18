"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Award,
  Check,
  Copy,
  ExternalLink,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
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
} from "@/components/ui";
import { formatDateTh, formatDuration } from "@/lib/format";
import { api } from "@/lib/api";
import { DownloadCertificateButton } from "@/components/course/CertificatePanel";

export interface CertificateRow {
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
  course_id: string;
  course_slug: string;
  status: "valid" | "expired" | "revoked";
}

export interface CertificatesManagerProps {
  initialData: {
    certificates: CertificateRow[];
    counts: { total: number; valid: number; expired: number; revoked: number };
    total: number;
    page: number;
    pageSize: number;
  };
  courses: { id: string; title: string; slug: string; visibility: string }[];
  searchQuery?: string;
  activeStatus?: string;
}

export function CertificatesManager({
  initialData,
  courses,
  searchQuery = "",
  activeStatus = "",
}: CertificatesManagerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Revoke Dialog State
  const [revokeCert, setRevokeCert] = useState<CertificateRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);

  // Manual Issue Dialog State
  const [issueOpen, setIssueOpen] = useState(false);
  const [userIdInput, setUserIdInput] = useState("");
  const [courseIdInput, setCourseIdInput] = useState(courses[0]?.id ?? "");
  const [scoreInput, setScoreInput] = useState("100");
  const [reasonInput, setReasonInput] = useState("ออกใบรับรองกรณีพิเศษ / เทียบโอนผลการเรียน");
  const [issuing, setIssuing] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
    toast({ title: "คัดลอกรหัสแล้ว", description: text });
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const q = (fd.get("q") as string) || "";
    const params = new URLSearchParams(searchParams.toString());
    if (q) params.set("q", q);
    else params.delete("q");
    params.set("page", "1");
    router.push(`/admin/certificates?${params.toString()}`);
  };

  const setStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status) params.set("status", status);
    else params.delete("status");
    params.set("page", "1");
    router.push(`/admin/certificates?${params.toString()}`);
  };

  const submitRevoke = async () => {
    if (!revokeCert) return;
    if (revokeReason.trim().length < 5) {
      toast({ variant: "destructive", title: "ข้อผิดพลาด", description: "กรุณาระบุเหตุผลในการเพิกถอนอย่างน้อย 5 ตัวอักษร" });
      return;
    }
    setRevoking(true);
    try {
      const res = await api(`/api/admin/certificates/${encodeURIComponent(revokeCert.certificate_code)}/revoke`, {
        method: "POST",
        body: { reason: revokeReason.trim() },
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: res.message });
        return;
      }
      toast({ title: "เพิกถอนสำเร็จ", description: `เพิกถอนใบรับรอง ${revokeCert.certificate_code} แล้ว` });
      setRevokeCert(null);
      setRevokeReason("");
      router.refresh();
    } finally {
      setRevoking(false);
    }
  };

  const submitManualIssue = async () => {
    if (!userIdInput.trim()) {
      toast({ variant: "destructive", title: "ข้อผิดพลาด", description: "กรุณาระบุ User ID ของผู้เรียน" });
      return;
    }
    if (!courseIdInput) {
      toast({ variant: "destructive", title: "ข้อผิดพลาด", description: "กรุณาเลือกหลักสูตร" });
      return;
    }
    setIssuing(true);
    try {
      const res = await api<{ code: string }>("/api/admin/certificates", {
        method: "POST",
        body: {
          userId: userIdInput.trim(),
          courseId: courseIdInput,
          score: Number(scoreInput) || 100,
          reason: reasonInput.trim(),
        },
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: res.message });
        return;
      }
      toast({ title: "ออกใบรับรองสำเร็จ", description: `รหัสใบรับรอง: ${res.data.code}` });
      setIssueOpen(false);
      setUserIdInput("");
      router.refresh();
    } finally {
      setIssuing(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(initialData.total / initialData.pageSize));

  return (
    <div className="space-y-6">
      {/* Top action bar: Search & Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={searchQuery}
              placeholder="ค้นหารหัสใบรับรอง, ชื่อผู้เรียน, หรืออีเมล…"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">ค้นหา</Button>
        </form>

        <Button onClick={() => setIssueOpen(true)} className="gap-1.5 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> ออกใบรับรองด้วยตนเอง
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <button
          type="button"
          onClick={() => setStatusFilter("")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            !activeStatus ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          ทั้งหมด ({initialData.counts.total})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("valid")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeStatus === "valid" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" /> ใช้งานได้ ({initialData.counts.valid})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("expired")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeStatus === "expired" ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <RotateCcw className="h-3.5 w-3.5" /> หมดอายุ ({initialData.counts.expired})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("revoked")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeStatus === "revoked" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <XCircle className="h-3.5 w-3.5" /> ถูกเพิกถอน ({initialData.counts.revoked})
        </button>
      </div>

      {/* Certificates Table */}
      <Card className="overflow-hidden">
        {initialData.certificates.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Award className="mx-auto h-12 w-12 stroke-[1.25] text-muted-foreground/60 mb-2" />
            <p className="font-medium text-foreground">ไม่พบรายการใบรับรอง</p>
            <p className="text-sm mt-1">ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground font-semibold">
                <tr>
                  <th className="px-4 py-3">รหัสใบรับรอง</th>
                  <th className="px-4 py-3">ผู้เรียน</th>
                  <th className="px-4 py-3">หลักสูตร</th>
                  <th className="px-4 py-3">ผลการเรียน</th>
                  <th className="px-4 py-3">วันที่ออก / หมดอายุ</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {initialData.certificates.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                    {/* Certificate Code */}
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-primary">{c.certificate_code}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(c.certificate_code)}
                          className="text-muted-foreground hover:text-foreground"
                          title="คัดลอกรหัส"
                        >
                          {copiedCode === c.certificate_code ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">{c.document_name_snapshot}</span>
                    </td>

                    {/* Learner */}
                    <td className="px-4 py-3.5 align-top">
                      <Link
                        href={`/admin/users/${c.user_id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {c.recipient_name_snapshot}
                      </Link>
                      <span className="text-xs text-muted-foreground block truncate max-w-[200px]">
                        {c.user_email}
                      </span>
                    </td>

                    {/* Course */}
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-foreground line-clamp-1 max-w-[220px]">
                          {c.course_title_snapshot}
                        </span>
                        {c.is_verified_course_snapshot && (
                          <Badge variant="success" className="text-[10px] px-1.5 py-0">Verified</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">ผู้สอน: {c.instructor_name_snapshot}</span>
                    </td>

                    {/* Performance */}
                    <td className="px-4 py-3.5 align-top whitespace-nowrap">
                      <div className="text-xs font-mono tabular-nums">
                        คะแนน: <span className="font-semibold text-foreground">{c.quiz_score_snapshot}%</span>
                      </div>
                      <span className="text-xs text-muted-foreground block font-mono">
                        เวลาเรียน: {formatDuration(c.total_actual_study_sec)}
                      </span>
                    </td>

                    {/* Dates */}
                    <td className="px-4 py-3.5 align-top whitespace-nowrap text-xs">
                      <div>ออกเมื่อ: {formatDateTh(c.issued_at)}</div>
                      {c.expires_at ? (
                        <div className="text-muted-foreground text-[11px]">หมดอายุ: {formatDateTh(c.expires_at)}</div>
                      ) : (
                        <div className="text-muted-foreground text-[11px]">ตลอดชีพ (No Expiry)</div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 align-top whitespace-nowrap">
                      {c.status === "valid" ? (
                        <Badge variant="success" className="gap-1">
                          <ShieldCheck className="h-3 w-3" /> ใช้งานได้
                        </Badge>
                      ) : c.status === "expired" ? (
                        <Badge variant="warning" className="gap-1">
                          <RotateCcw className="h-3 w-3" /> หมดอายุ
                        </Badge>
                      ) : (
                        <div>
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" /> ถูกเพิกถอน
                          </Badge>
                          {c.revoked_reason && (
                            <span className="text-[11px] text-destructive block mt-1 line-clamp-1 max-w-[160px]" title={c.revoked_reason}>
                              เหตุผล: {c.revoked_reason}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/verify/${encodeURIComponent(c.certificate_code)}`}
                          target="_blank"
                          className={buttonClass("ghost", "sm", "h-8 px-2 text-muted-foreground hover:text-foreground")}
                          title="ดูหน้าตรวจสอบสาธารณะ"
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> ตรวจสอบ
                        </Link>
                        <DownloadCertificateButton code={c.certificate_code} variant="outline" size="sm" compact />
                        {c.status !== "revoked" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => {
                              setRevokeCert(c);
                              setRevokeReason("");
                            }}
                            title="เพิกถอนใบรับรอง"
                          >
                            <ShieldAlert className="h-3.5 w-3.5 mr-1" /> เพิกถอน
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>แสดงหน้า {initialData.page} จาก {totalPages} (ทั้งหมด {initialData.total} รายการ)</span>
          <div className="flex items-center gap-1">
            {initialData.page > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("page", String(initialData.page - 1));
                  router.push(`/admin/certificates?${params.toString()}`);
                }}
              >
                ก่อนหน้า
              </Button>
            )}
            {initialData.page < totalPages && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("page", String(initialData.page + 1));
                  router.push(`/admin/certificates?${params.toString()}`);
                }}
              >
                ถัดไป
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Revocation Modal */}
      <Dialog
        open={!!revokeCert}
        onOpenChange={(open) => !open && setRevokeCert(null)}
        title="เพิกถอนใบรับรอง"
        description="การเพิกถอนใบรับรองจะทำให้สถานะในระบบสาธารณะกลายเป็น ถูกเพิกถอน (REVOKED) ทันที และส่งอีเมลแจ้งผู้เรียน"
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
        title="ออกใบรับรองด้วยตนเอง (Manual Issue)"
        description="สำหรับกรณีผู้เรียนผ่านการทดสอบภาคปฏิบัติภายนอก เทียบโอนผลการเรียน หรือการออกใบรับรองเป็นกรณีพิเศษโดยผู้ดูแลระบบ"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" disabled={issuing} onClick={() => setIssueOpen(false)}>
              ยกเลิก
            </Button>
            <Button loading={issuing} onClick={submitManualIssue}>
              ออกใบรับรองทันที
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

          <Field label="หลักสูตรที่ต้องการออกใบรับรอง">
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
