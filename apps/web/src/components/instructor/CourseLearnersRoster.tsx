"use client";

import { useState, useEffect } from "react";
import {
  Search,
  RefreshCw,
  Unlock,
  CheckCircle2,
  Clock,
  BookOpen,
  Award,
  Download,
  Eye,
} from "lucide-react";
import {
  Card,
  Input,
  Select,
  Button,
  Badge,
  Dialog,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LearnerItem {
  enrollment_id: string;
  status: "in_progress" | "completed";
  enrolled_at: string;
  completed_at: string | null;
  user_id: string;
  user_email: string;
  legal_full_name_th: string | null;
  legal_full_name_en: string | null;
  certificate_code: string | null;
  study_sec: number;
  lessons_completed: number;
  lessons_total: number;
  best_quiz_score: string | null;
  attempts_24h: number;
  total_attempts: number;
}

interface LearnerProgressDetail {
  enrollment: {
    id: string;
    status: "in_progress" | "completed";
    enrolled_at: string;
    completed_at: string | null;
    email: string;
    legal_full_name_th: string | null;
    legal_full_name_en: string | null;
  };
  lessons: Array<{
    id: string;
    sequence_order: number;
    title: string;
    duration_sec: number;
    checkpoint_question: string | null;
    checkpoint_at_sec: number | null;
    is_completed: boolean | null;
    accumulated_valid_sec: number | null;
    max_watched_sec: number | null;
    watched_chunks: number | null;
    total_chunks_required: number | null;
  }>;
  attempts: Array<{
    id: string;
    assessment_type: string;
    started_at: string;
    submitted_at: string | null;
    score_percentage: number | null;
    is_passed: boolean | null;
  }>;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "0 นาที";
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours > 0) return `${hours} ชม. ${minutes} นาที`;
  return `${minutes} นาที`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CourseLearnersRoster({
  courseId,
  maxAttemptsPerDay = 3,
}: {
  courseId: string;
  maxAttemptsPerDay?: number;
}) {
  const toast = useToast();
  const [learners, setLearners] = useState<LearnerItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Detail Modal
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<LearnerProgressDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Action busy states
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [grantDialog, setGrantDialog] = useState<{ enrollmentId: string; name: string } | null>(null);
  const [grantType, setGrantType] = useState<"pre" | "post">("post");
  const [grantReason, setGrantReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    const sp = new URLSearchParams({
      page: String(page),
      pageSize: "50",
    });
    if (query.trim()) sp.set("q", query.trim());
    if (statusFilter !== "all") sp.set("status", statusFilter);

    api<{
      learners: LearnerItem[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/instructor/courses/${courseId}/learners?${sp.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setLoading(false);
        if (res.ok) {
          // The API returns { learners, total, page, pageSize } (reading "items" crashed the tab once a learner existed)
          setLearners(res.data.learners ?? []);
          setTotalCount(res.data.total);
        } else {
          toast({
            variant: "destructive",
            title: "โหลดข้อมูลผู้เรียนไม่สำเร็จ",
            description: res.message,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        toast({
          variant: "destructive",
          title: "เกิดข้อผิดพลาดในการโหลดข้อมูล",
          description: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, page, query, statusFilter, refreshKey, toast]);

  const triggerRefresh = () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const handleResetQuiz = async (enrollmentId: string) => {
    setResettingId(enrollmentId);
    try {
      const res = await api(`/api/instructor/courses/${courseId}/learners/${enrollmentId}/reset-quiz`, {
        method: "POST",
      });
      if (res.ok) {
        toast({ title: "ปลดล็อกสิทธิ์สอบสำเร็จ", description: "ผู้เรียนสามารถเข้าทำแบบทดสอบใหม่ได้ทันที" });
        triggerRefresh();
      } else {
        toast({ variant: "destructive", title: "ปลดล็อกไม่สำเร็จ", description: res.message });
      }
    } finally {
      setResettingId(null);
    }
  };

  const handleGrantAttempt = async () => {
    if (!grantDialog) return;
    setResettingId(grantDialog.enrollmentId);
    try {
      const res = await api(`/api/instructor/courses/${courseId}/learners/${grantDialog.enrollmentId}/reset-quiz`, {
        method: "POST",
        body: { assessmentType: grantType, reason: grantReason || undefined },
      });
      if (res.ok) {
        toast({ title: "ให้สิทธิ์สอบเพิ่มสำเร็จ", description: `ผู้เรียนสามารถสอบประเภท "${grantType}" ได้ทันที` });
        setGrantDialog(null);
        setGrantReason("");
        triggerRefresh();
      } else {
        toast({ variant: "destructive", title: "ให้สิทธิ์ไม่สำเร็จ", description: res.message });
      }
    } finally {
      setResettingId(null);
    }
  };

  const handleOpenDetail = async (enrollmentId: string) => {
    setSelectedEnrollmentId(enrollmentId);
    setDetailLoading(true);
    try {
      const res = await api<LearnerProgressDetail>(
        `/api/instructor/courses/${courseId}/learners/${enrollmentId}/progress`,
      );
      if (res.ok) {
        setDetailData(res.data);
      } else {
        toast({
          variant: "destructive",
          title: "โหลดรายละเอียดไม่สำเร็จ",
          description: res.message,
        });
        setSelectedEnrollmentId(null);
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (learners.length === 0) {
      toast({
        title: "ไม่มีข้อมูลสำหรับส่งออก",
      });
      return;
    }

    const headers = [
      "ชื่อ-นามสกุล (ไทย)",
      "ชื่อ-นามสกุล (อังกฤษ)",
      "อีเมล",
      "สถานะ",
      "วันที่ลงทะเบียน",
      "วันที่เรียนจบ",
      "รหัสใบประกาศ",
      "เวลาเรียนรวม (นาที)",
      "บทเรียนที่ผ่าน",
      "บทเรียนทั้งหมด",
      "คะแนนสอบสูงสุด (%)",
      "จำนวนครั้งที่สอบรวม",
    ];

    const rows = learners.map((l) => [
      `"${l.legal_full_name_th || "-"}"`,
      `"${l.legal_full_name_en || "-"}"`,
      `"${l.user_email}"`,
      `"${l.status === "completed" ? "เรียนจบแล้ว" : "กำลังเรียน"}"`,
      `"${formatDate(l.enrolled_at)}"`,
      `"${formatDate(l.completed_at)}"`,
      `"${l.certificate_code || "-"}"`,
      Math.round(l.study_sec / 60),
      l.lessons_completed,
      l.lessons_total,
      l.best_quiz_score ? Number(l.best_quiz_score).toFixed(1) : "-",
      l.total_attempts,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `learners-course-${courseId.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "ส่งออกไฟล์ CSV แล้ว",
      description: `ดาวน์โหลดรายชื่อผู้เรียน ${learners.length} คนเรียบร้อย`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Header */}
      <Card className="p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อ, นามสกุล หรืออีเมล..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                  setLoading(true);
                }}
                className="pl-8 text-sm"
              />
            </div>

            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
                setLoading(true);
              }}
              className="w-36 text-sm"
            >
              <option value="all">สถานะทั้งหมด</option>
              <option value="in_progress">กำลังเรียน</option>
              <option value="completed">เรียนจบแล้ว</option>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={triggerRefresh}
              disabled={loading}
              className="h-9"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="h-9 gap-1.5 text-xs font-medium"
            >
              <Download className="h-3.5 w-3.5" /> ส่งออก CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* Learners Table */}
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">ผู้เรียน</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">ความคืบหน้าบทเรียน</th>
                <th className="px-4 py-3">คะแนน Post-test</th>
                <th className="px-4 py-3">การสอบ 24 ชม.</th>
                <th className="px-4 py-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && learners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    กำลังโหลดรายชื่อผู้เรียน...
                  </td>
                </tr>
              ) : learners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <BookOpen className="mx-auto mb-2 h-6 w-6 opacity-40" />
                    {query ? "ไม่พบผู้เรียนที่ตรงกับคำค้นหา" : "ยังไม่มีผู้เรียนลงทะเบียนในหลักสูตรนี้"}
                  </td>
                </tr>
              ) : (
                learners.map((learner) => {
                  const percentLessons =
                    learner.lessons_total > 0
                      ? Math.round((learner.lessons_completed / learner.lessons_total) * 100)
                      : 0;
                  const isLocked = learner.attempts_24h >= maxAttemptsPerDay;
                  const displayName =
                    learner.legal_full_name_th ||
                    learner.legal_full_name_en ||
                    learner.user_email.split("@")[0] ||
                    "ผู้เรียน";

                  return (
                    <tr
                      key={learner.enrollment_id}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      {/* Learner Name & Email */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {displayName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {learner.user_email}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {learner.status === "completed" ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="success" className="w-fit text-[11px] gap-1">
                              <CheckCircle2 className="h-3 w-3" /> จบหลักสูตร
                            </Badge>
                            {learner.certificate_code && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                #{learner.certificate_code}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="w-fit text-[11px] gap-1">
                            <Clock className="h-3 w-3" /> กำลังเรียน
                          </Badge>
                        )}
                      </td>

                      {/* Lesson Progress */}
                      <td className="px-4 py-3 min-w-[160px]">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {learner.lessons_completed} / {learner.lessons_total} บท
                            </span>
                            <span className="font-semibold tabular-nums text-foreground">
                              {percentLessons}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: `${percentLessons}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            เวลาเรียน {formatDuration(learner.study_sec)}
                          </span>
                        </div>
                      </td>

                      {/* Quiz Score */}
                      <td className="px-4 py-3">
                        {learner.best_quiz_score ? (
                          <div className="flex items-center gap-1.5">
                            <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <span className="font-semibold tabular-nums text-foreground">
                              {Number(learner.best_quiz_score).toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">ยังไม่มีคะแนน</span>
                        )}
                      </td>

                      {/* 24h Attempts */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-xs font-medium tabular-nums",
                              isLocked
                                ? "text-amber-600 dark:text-amber-400 font-semibold"
                                : "text-muted-foreground",
                            )}
                          >
                            {learner.attempts_24h} / {maxAttemptsPerDay} ครั้ง
                          </span>
                          {isLocked && (
                            <Badge variant="warning" className="text-[10px] px-1 py-0">
                              ล็อก 24h
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isLocked && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs text-amber-600 border-amber-500/30 hover:bg-amber-500/10 dark:text-amber-400"
                              disabled={resettingId === learner.enrollment_id}
                              onClick={() => handleResetQuiz(learner.enrollment_id)}
                            >
                              <Unlock className="mr-1 h-3.5 w-3.5" />
                              ปลดล็อก
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                            disabled={resettingId === learner.enrollment_id}
                            onClick={() => { setGrantType("post"); setGrantReason(""); setGrantDialog({ enrollmentId: learner.enrollment_id, name: displayName }); }}
                          >
                            <Unlock className="mr-1 h-3.5 w-3.5" /> ให้สิทธิ์สอบ
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => handleOpenDetail(learner.enrollment_id)}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" /> ตรวจสอบ
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span>
            แสดง {learners.length} จาก {totalCount} รายการ
          </span>
        </div>
      </Card>

      {/* Learner Progress Detail Dialog */}
      <Dialog
        open={!!selectedEnrollmentId}
        onOpenChange={(open) => !open && setSelectedEnrollmentId(null)}
        title="ประวัติและความคืบหน้าการเรียนรายบุคคล"
        description="ตรวจสอบสถิติเวลาเรียนจริง การตอบคำถามระหว่างคลิป และประวัติการทำแบบทดสอบ"
        footer={
          <div className="flex w-full items-center justify-between">
            {detailData && (
              <span className="text-xs text-muted-foreground">
                ลงทะเบียนเมื่อ: {formatDate(detailData.enrollment.enrolled_at)}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedEnrollmentId(null)}
            >
              ปิดหน้าต่าง
            </Button>
          </div>
        }
      >
        {detailLoading || !detailData ? (
          <div className="py-12 text-center text-muted-foreground">
            <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
            กำลังโหลดข้อมูลเชิงลึก...
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Learner Profile Header */}
            <div className="rounded-xl border bg-muted/30 p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-foreground">
                    {detailData.enrollment.legal_full_name_th ||
                      detailData.enrollment.legal_full_name_en ||
                      "ไม่ระบุชื่อทางการ"}
                  </h4>
                  <p className="text-xs text-muted-foreground">{detailData.enrollment.email}</p>
                </div>
                <Badge
                  variant={
                    detailData.enrollment.status === "completed" ? "success" : "secondary"
                  }
                >
                  {detailData.enrollment.status === "completed" ? "สำเร็จหลักสูตร" : "กำลังศึกษา"}
                </Badge>
              </div>
            </div>

            {/* Lessons Breakdown */}
            <div className="space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                ความคืบหน้ารายบทเรียน ({detailData.lessons.length} บท)
              </h5>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {detailData.lessons.map((lesson) => {
                  const watchedSec = lesson.accumulated_valid_sec ?? 0;
                  const isDone = !!lesson.is_completed;
                  return (
                    <div
                      key={lesson.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg border p-2.5 text-xs transition-colors",
                        isDone
                          ? "border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/20"
                          : "border-border bg-card",
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            บทที่ {lesson.sequence_order}: {lesson.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            ดูแล้ว {formatDuration(watchedSec)} จาก {formatDuration(lesson.duration_sec)}
                            {lesson.checkpoint_question && " · มีคำถามระหว่างคลิป"}
                          </p>
                        </div>
                      </div>

                      <Badge
                        variant={isDone ? "success" : "outline"}
                        className="text-[10px] shrink-0"
                      >
                        {isDone ? "ผ่านแล้ว" : "ยังไม่ผ่าน"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quiz Attempts History */}
            <div className="space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                ประวัติการทำแบบทดสอบ ({detailData.attempts.length} ครั้งล่าสุด)
              </h5>
              {detailData.attempts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">ยังไม่มีประวัติการส่งข้อสอบ</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {detailData.attempts.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between rounded-lg border bg-card p-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            att.assessment_type === "post"
                              ? "default"
                              : att.assessment_type === "pre"
                              ? "secondary"
                              : "warning"
                          }
                          className="text-[10px]"
                        >
                          {att.assessment_type.toUpperCase()}
                        </Badge>
                        <span className="text-muted-foreground">
                          {formatDate(att.submitted_at || att.started_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums text-foreground">
                          {att.score_percentage != null
                            ? `${Number(att.score_percentage).toFixed(0)}%`
                            : "กำลังทำ"}
                        </span>
                        <Badge
                          variant={att.is_passed ? "success" : "destructive"}
                          className="text-[10px]"
                        >
                          {att.is_passed ? "ผ่านเกณฑ์" : "ไม่ผ่าน"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/* I-16: Grant extra quiz attempt dialog */}
      <Dialog
        open={!!grantDialog}
        onOpenChange={(open) => !open && setGrantDialog(null)}
        title={`ให้สิทธิ์สอบเพิ่ม: ${grantDialog?.name ?? ""}`}
        description="เปิดหน้าต่างสอบใหม่ทันที ไม่ล้างประวัติหรือคะแนนเดิม"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setGrantDialog(null)}>ยกเลิก</Button>
            <Button size="sm" loading={!!resettingId} onClick={handleGrantAttempt}>ให้สิทธิ์</Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium">ประเภทการสอบ</label>
            <div className="mt-1.5 flex gap-2">
              {(["pre", "post"] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={grantType === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setGrantType(t)}
                >
                  {t === "pre" ? "Pre-test" : "Post-test"}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">เหตุผล (ไม่บังคับ)</label>
            <textarea
              className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
              maxLength={500}
              placeholder="เช่น ระบบขัดข้องระหว่างสอบ, ผู้เรียนแจ้งปัญหา..."
              value={grantReason}
              onChange={(e) => setGrantReason(e.target.value)}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
