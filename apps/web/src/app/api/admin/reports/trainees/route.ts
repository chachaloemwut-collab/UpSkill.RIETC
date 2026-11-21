import { route } from "@/server/http";
import { audit } from "@/server/audit";
import { ctx } from "@/server/context";
import { courseSummary, listTrainees, parseReportFilter } from "@/server/admin/reports.service";
import { REPORT_COLUMNS, csvCell, reportCells } from "@/lib/trainee-report";

/**
 * CSV (opens in Excel / Google Sheets; UTF-8 BOM for Thai). ?kind=summary for one line per course,
 * otherwise one line per enrolment with the same filters as /admin/reports. Every export is audited.
 */
export const GET = route({ auth: "required", roles: ["admin"] }, async ({ user, ip, req }) => {
  const sp = req.nextUrl.searchParams;
  const filter = parseReportFilter(sp);
  const summary = sp.get("kind") === "summary";
  const table: string[][] = summary
    ? [
        ["หลักสูตร", "ลงทะเบียน", "กำลังเรียน", "เรียนจบ", "ได้รับวุฒิบัตร"],
        ...(await courseSummary(filter)).map((r) => [r.course_title, String(r.enrolled), String(r.in_progress), String(r.completed), String(r.certified)]),
      ]
    : [[...REPORT_COLUMNS], ...(await listTrainees(filter)).map((r, i) => reportCells(r, i))];

  await audit(ctx().db, {
    action: "admin.trainees_exported",
    userId: user!.id,
    ip,
    details: { kind: summary ? "summary" : "trainees", rows: table.length - 1, ...filter },
  });

  const csv = "﻿" + table.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${summary ? "course-summary" : "trainees"}-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
});
