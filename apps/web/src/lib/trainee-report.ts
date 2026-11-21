// Columns of the admin trainee report, shared by the on-screen table, the CSV export and the PNG image,
// so every format shows the same data. Client-safe (no server imports).
import { formatDateTh, formatDuration } from "./format";

export interface TraineeReportRow {
  name: string;
  email: string;
  phone: string | null;
  province: string | null;
  course_title: string;
  status: string;
  enrolled_at: Date | string;
  completed_at: Date | string | null;
  study_sec: number;
  lessons_done: number;
  lessons_total: number;
  certificate_code: string | null;
  issued_at: Date | string | null;
  certificate_revoked_at: Date | string | null;
}

const STATUS_TH: Record<string, string> = { in_progress: "กำลังเรียน", completed: "เรียนจบ", revoked: "ยกเลิกการลงทะเบียน" };

export const REPORT_STATUS_OPTIONS: Array<[string, string]> = [
  ["", "ทุกสถานะ"],
  ["in_progress", "กำลังเรียน"],
  ["completed", "เรียนจบ"],
  ["certified", "ได้รับวุฒิบัตรแล้ว"],
  ["completed_no_cert", "เรียนจบ แต่ยังไม่ได้รับวุฒิบัตร"],
  ["revoked", "ยกเลิกการลงทะเบียน"],
];

export const REPORT_COLUMNS = [
  "ลำดับ",
  "ชื่อ-นามสกุล",
  "อีเมล",
  "เบอร์โทร",
  "จังหวัด",
  "หลักสูตร",
  "วันที่ลงทะเบียน",
  "สถานะ",
  "บทที่ผ่าน",
  "เวลาเรียน",
  "วันที่เรียนจบ",
  "รหัสวุฒิบัตร",
  "วันที่ออกวุฒิบัตร",
] as const;

export function reportCells(r: TraineeReportRow, index: number): string[] {
  const cert = r.certificate_code ? (r.certificate_revoked_at ? `${r.certificate_code} (เพิกถอน)` : r.certificate_code) : "";
  return [
    String(index + 1),
    r.name,
    r.email,
    r.phone ?? "",
    r.province ?? "",
    r.course_title,
    formatDateTh(r.enrolled_at),
    STATUS_TH[r.status] ?? r.status,
    `${r.lessons_done}/${r.lessons_total}`,
    formatDuration(r.study_sec),
    r.completed_at ? formatDateTh(r.completed_at) : "",
    cert,
    r.issued_at ? formatDateTh(r.issued_at) : "",
  ];
}

/** CSV cell: quoted, and spreadsheet formulas neutralised (cells starting with = + - @ tab/CR run as formulas in Excel) */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replaceAll('"', '""')}"`;
}
