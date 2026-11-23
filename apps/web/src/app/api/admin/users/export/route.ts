import { route } from "@/server/http";
import { audit } from "@/server/audit";
import { ctx } from "@/server/context";
import { exportUsersAdmin } from "@/server/admin/users.service";

const ROLE_TH: Record<string, string> = { member: "ผู้เรียน", instructor: "ผู้สอน", admin: "ผู้ดูแลระบบ" };
const STATUS_TH: Record<string, string> = { active: "ใช้งาน", suspended: "ระงับชั่วคราว", banned: "ระงับถาวร" };

const csvCell = (v: string) => `"${v.replaceAll('"', '""')}"`;

export const GET = route({ auth: "required", roles: ["admin"] }, async ({ user, ip, req }) => {
  const sp = req.nextUrl.searchParams;
  const rows = await exportUsersAdmin({ idRecord: sp.get("idRecord") ?? undefined, query: sp.get("q") ?? undefined, role: sp.get("role") ?? undefined, status: sp.get("status") ?? undefined });
  await audit(ctx().db, { action: "admin.users_exported", userId: user!.id, ip, details: { rows: rows.length } });

  const header = ["อีเมล", "ชื่อ-นามสกุลไทย", "ชื่อภาษาอังกฤษ", "บทบาท", "สถานะ", "ยืนยันอีเมลแล้ว", "ลงทะเบียน (คอร์ส)", "วุฒิบัตร", "สมัครเมื่อ", "ใช้งานล่าสุด", "ลบบัญชีแล้ว"];
  const body = rows.map((r) => [
    r.email,
    r.legal_full_name_th ?? "",
    r.legal_full_name_en ?? "",
    ROLE_TH[r.role] ?? r.role,
    STATUS_TH[r.status] ?? r.status,
    r.email_verified_at ? "ใช่" : "ไม่",
    String(r.enrollments),
    String(r.certificates),
    r.created_at.toISOString().slice(0, 10),
    r.last_active_at ?? "",
    r.deleted_at ? "ใช่" : "ไม่",
  ]);
  // BOM so Excel opens Thai text as UTF-8
  const csv = "\uFEFF" + [header, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="users-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
});
