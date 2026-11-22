import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Filter, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, buttonClass } from "@/components/ui";
import { PrintReportButton, ReportImageButton } from "@/components/admin/ReportImageButton";
import { requireAdminPage } from "@/server/programs/admin-page";
import { courseSummary, listReportCourses, listTrainees, parseReportFilter } from "@/server/admin/reports.service";
import { REPORT_COLUMNS, REPORT_STATUS_OPTIONS, reportCells } from "@/lib/trainee-report";
import { formatDateTimeTh } from "@/lib/format";

export const metadata: Metadata = { title: "รายงานผู้อบรม", robots: { index: false } };

const PAGE_ROWS = 500;

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const filter = parseReportFilter(sp);
  const [courses, summary, rows] = await Promise.all([listReportCourses(), courseSummary(filter), listTrainees(filter, PAGE_ROWS + 1)]);
  const shown = rows.slice(0, PAGE_ROWS);
  const cells = shown.map((r, i) => reportCells(r, i));

  const qs = new URLSearchParams(Object.entries({ course: filter.courseId, status: filter.status, from: filter.from, to: filter.to, q: filter.q }).filter(([, v]) => v) as [string, string][]).toString();
  const courseName = filter.courseId ? courses.find((c) => c.id === filter.courseId)?.title ?? "หลักสูตรที่เลือก" : "ทุกหลักสูตร";
  const statusName = REPORT_STATUS_OPTIONS.find(([v]) => v === (filter.status ?? ""))?.[1] ?? "ทุกสถานะ";
  const subtitle = `${courseName} · ${statusName}${filter.from || filter.to ? ` · ลงทะเบียน ${filter.from ?? "…"} ถึง ${filter.to ?? "…"}` : ""} · ข้อมูล ณ ${formatDateTimeTh(new Date())}`;
  const totals = summary.reduce((t, r) => ({ enrolled: t.enrolled + r.enrolled, completed: t.completed + r.completed, certified: t.certified + r.certified }), { enrolled: 0, completed: 0, certified: 0 });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="รายงานผู้อบรม" description="ดูรายชื่อผู้อบรมแยกตามหลักสูตร ความคืบหน้า และวุฒิบัตร ส่งออกเป็น Excel (CSV) ภาพ หรือพิมพ์ — อ่านอย่างเดียว ไม่แก้ไขข้อมูล" />

      {/* GET form: works without JavaScript and keeps the filters in the URL (shareable, bookmarkable) */}
      <Card className="no-print mb-6 p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end 2xl:grid-cols-[2fr_1.4fr_1fr_1fr_1.4fr_auto]">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">หลักสูตร</span>
            <select name="course" defaultValue={filter.courseId ?? ""} className="h-11 w-full min-w-0 rounded-md border bg-background px-3">
              <option value="">ทุกหลักสูตร</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">สถานะ</span>
            <select name="status" defaultValue={filter.status ?? ""} className="h-11 w-full min-w-0 rounded-md border bg-background px-3">
              {REPORT_STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">ลงทะเบียนตั้งแต่</span>
            <input type="date" name="from" defaultValue={filter.from ?? ""} className="h-11 w-full min-w-0 rounded-md border bg-background px-3" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">ถึง</span>
            <input type="date" name="to" defaultValue={filter.to ?? ""} className="h-11 w-full min-w-0 rounded-md border bg-background px-3" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">ค้นหา</span>
            <input name="q" defaultValue={filter.q ?? ""} placeholder="ชื่อ อีเมล เบอร์โทร รหัสวุฒิบัตร" className="h-11 w-full min-w-0 rounded-md border bg-background px-3" />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("default", "lg", "h-11")}><Filter className="h-4 w-4" /> แสดง</button>
            {qs && <Link href="/admin/reports" className={buttonClass("ghost", "lg", "h-11")}>ล้าง</Link>}
          </div>
        </form>
      </Card>

      {/* Per-course funnel */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold"><Users className="h-5 w-5" /> สรุปรายหลักสูตร</h2>
          <p className="text-sm text-muted-foreground">ลงทะเบียน {totals.enrolled} · เรียนจบ {totals.completed} · ได้รับวุฒิบัตร {totals.certified}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2">หลักสูตร</th><th className="px-4 py-2 text-right">ลงทะเบียน</th><th className="px-4 py-2 text-right">กำลังเรียน</th><th className="px-4 py-2 text-right">เรียนจบ</th><th className="px-4 py-2 text-right">ได้รับวุฒิบัตร</th><th className="no-print px-4 py-2" /></tr>
            </thead>
            <tbody className="divide-y">
              {summary.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">ยังไม่มีผู้ลงทะเบียนตามเงื่อนไขนี้</td></tr>}
              {summary.map((r) => (
                <tr key={r.course_id}>
                  <td className="max-w-[18rem] truncate px-4 py-2 font-medium" title={r.course_title}>{r.course_title}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.enrolled}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.in_progress}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.completed}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.certified}</td>
                  <td className="no-print px-4 py-2 text-right">
                    <Link className="text-primary hover:underline" href={`/admin/reports?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qs)), course: r.course_id }).toString()}`}>ดูรายชื่อ</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Trainees */}
      <Card className="overflow-hidden">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">รายชื่อผู้อบรม ({rows.length > PAGE_ROWS ? `${PAGE_ROWS}+` : rows.length} รายการ)</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/admin/reports/trainees?${qs}`} className={buttonClass("default", "md")}><FileSpreadsheet className="h-4 w-4" /> Excel (CSV) รายชื่อ</a>
            <a href={`/api/admin/reports/trainees?${qs}${qs ? "&" : ""}kind=summary`} className={buttonClass("outline", "md")}><FileSpreadsheet className="h-4 w-4" /> Excel (CSV) สรุป</a>
            <ReportImageButton title="รายงานผู้อบรม" subtitle={subtitle} columns={REPORT_COLUMNS} rows={cells} fileName={`trainees-${new Date().toISOString().slice(0, 10)}.png`} />
            <PrintReportButton />
          </div>
        </div>
        <div className="print-only hidden px-4 pt-4">
          <h1 className="text-lg font-semibold">รายงานผู้อบรม</h1>
          <p className="text-sm">{subtitle}</p>
        </div>
        {rows.length > PAGE_ROWS && (
          <p className="no-print border-b bg-warning/10 px-4 py-2 text-sm text-warning">แสดง {PAGE_ROWS} รายการแรก — ดาวน์โหลด Excel (CSV) เพื่อดูทั้งหมด หรือกรองให้แคบลง</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm print:text-[9pt] [&_td]:whitespace-nowrap print:[&_td]:whitespace-normal">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>{REPORT_COLUMNS.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {cells.length === 0 && <tr><td colSpan={REPORT_COLUMNS.length} className="px-4 py-8 text-center text-muted-foreground">ไม่พบผู้อบรมตามเงื่อนไขนี้</td></tr>}
              {cells.map((r, i) => (
                <tr key={shown[i]!.enrollment_id} className="hover:bg-muted/30">
                  {r.map((cell, j) => (
                    <td key={j} className={`px-3 py-2 align-top ${j === 1 ? "font-medium" : ""} ${j === 0 || j === 8 ? "tabular-nums" : ""}`}>
                      {j === 1 ? <Link href={`/admin/users/${shown[i]!.user_id}`} className="hover:underline">{cell}</Link> : j === 11 && shown[i]!.certificate_code ? (
                        <a href={`/api/certificates/${encodeURIComponent(shown[i]!.certificate_code!)}/download?inline=1`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-primary hover:underline">{cell}</a>
                      ) : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
