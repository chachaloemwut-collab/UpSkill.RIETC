import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, BellRing, ChevronRight, Clock, Fingerprint, GraduationCap, History, KeyRound, Mail, ShieldAlert, Smartphone, UserRound } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { UserAdminActions } from "@/components/admin/UserAdminActions";
import { DisconnectDevice } from "@/components/account/DisconnectDevice";
import { PasswordAdminPanel } from "@/components/admin/PasswordAdminPanel";
import { listPasswordResets } from "@/server/admin/password.service";
import { LegalNameAdminCard } from "@/components/admin/LegalNameAdminCard";
import { EnrollmentAdminActions } from "@/components/admin/EnrollmentAdminActions";
import { ROLE_LABEL, formatDateTimeTh } from "@/lib/format";
import { getUserDetailAdmin } from "@/server/admin/users.service";
import { requireAdminPage } from "@/server/programs/admin-page";

export const metadata: Metadata = { title: "รายละเอียดสมาชิก", robots: { index: false } };

const STATUS_LABEL: Record<string, { label: string; variant: "secondary" | "success" | "warning" | "destructive" }> = {
  active: { label: "ใช้งาน", variant: "success" },
  suspended: { label: "ระงับชั่วคราว", variant: "warning" },
  banned: { label: "ระงับถาวร", variant: "destructive" },
};

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage();
  const { id } = await params;
  const d = await getUserDetailAdmin(id).catch(() => null);
  if (!d) notFound();
  const u = d.user;
  const resets = u.is_system_owner ? [] : await listPasswordResets(u.id);
  const name = u.legal_full_name_th ?? u.legal_full_name_en ?? u.username ?? u.email;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href="/admin/users" className="transition-colors hover:text-foreground">จัดการสมาชิก</Link>
            <ChevronRight className="h-3.5 w-3.5" /> {u.email}
          </span>
        }
        title={name}
        description={`สมาชิกตั้งแต่ ${formatDateTimeTh(u.created_at)} · บทบาท ${ROLE_LABEL[u.role] ?? u.role}`}
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{ROLE_LABEL[u.role] ?? u.role}</Badge>
          <Badge variant={u.deleted_at ? "destructive" : (STATUS_LABEL[u.status]?.variant ?? "secondary")}>{u.deleted_at ? "ลบบัญชีแล้ว" : (STATUS_LABEL[u.status]?.label ?? u.status)}</Badge>
          {u.is_system_owner && <Badge variant="success">เจ้าของระบบ</Badge>}
          {u.email_verified_at && <Badge variant="outline">ยืนยันอีเมลแล้ว</Badge>}
        </div>
      </PageHeader>

      <div className="grid gap-6">
        <Card className="p-6">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><UserRound className="h-5 w-5" /> การจัดการบัญชี</h2>
          <UserAdminActions userId={u.id} currentRole={u.role} currentStatus={u.status} protectedUser={u.is_system_owner} emailVerified={Boolean(u.email_verified_at)} />
        </Card>

        {!u.is_system_owner && (
          <Card className="p-6">
            <h2 className="mb-1 flex items-center gap-2 font-semibold"><KeyRound className="h-5 w-5" /> รหัสผ่านและการเข้าสู่ระบบ</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {u.has_password ? `ตั้งรหัสผ่านล่าสุด ${u.password_updated_at ? formatDateTimeTh(u.password_updated_at) : "-"}` : "บัญชีนี้ยังไม่มีรหัสผ่าน (เข้าสู่ระบบด้วย Google)"}
              {" · "}ผู้ใช้กู้รหัสผ่านเองได้ที่หน้า “ลืมรหัสผ่าน” ด้วยอีเมลหรือชื่อผู้ใช้
            </p>
            <PasswordAdminPanel userId={u.id} email={u.email} emailVerified={Boolean(u.email_verified_at)} mustChange={u.must_change_password} />
            {resets.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-medium">ประวัติคำขอตั้งรหัสผ่าน</h3>
                <ul className="divide-y rounded-lg border text-sm">
                  {resets.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span>{RESET_METHOD[r.reset_method] ?? r.reset_method}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTimeTh(r.created_at)} ·{" "}
                        {r.used_at ? `ใช้แล้ว ${formatDateTimeTh(r.used_at)}` : new Date(r.expires_at) < new Date() ? "หมดอายุ" : "ยังใช้ได้"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Mail className="h-5 w-5" /> อีเมลในระบบ ({d.linkedEmails.length})</h2>
            <ul className="divide-y text-sm">
              {d.linkedEmails.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{item.email}</span>
                    {item.is_primary && <Badge variant="success" className="text-[10px]">อีเมลหลัก</Badge>}
                  </div>
                  {item.verified_at ? (
                    <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 text-[10px]">ยืนยันแล้ว</Badge>
                  ) : (
                    <Badge variant="warning" className="text-[10px]">รอยืนยัน</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <LegalNameAdminCard
            userId={u.id}
            nameTh={u.legal_full_name_th}
            nameEn={u.legal_full_name_en}
            lockedAt={u.legal_name_locked_at ? u.legal_name_locked_at.toISOString() : null}
          />

          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><UserRound className="h-5 w-5" /> ข้อมูลส่วนตัว (PDPA)</h2>
            {d.profile ? (
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="ชื่อ-นามสกุลไทย" value={`${d.profile.title_th}${d.profile.first_name_th} ${d.profile.last_name_th}`} />
                <Row label="ชื่อภาษาอังกฤษ" value={`${d.profile.title_en}${d.profile.first_name_en} ${d.profile.last_name_en}`} />
                <Row label="เบอร์โทร" value={d.profile.phone} />
                <Row label="วันเกิด" value={d.profile.birth_date ? formatDateTimeTh(d.profile.birth_date) : null} />
                <Row label="เลขบัตร (4 ตัวท้าย)" value={d.profile.national_id_last4} />
                <Row label="ที่อยู่" value={`${d.profile.address_line} ${d.profile.subdistrict} ${d.profile.district} ${d.profile.province} ${d.profile.postal_code}`} full />
                {d.profile.guardian_name && <Row label="ผู้ปกครอง" value={`${d.profile.guardian_name}${d.profile.guardian_phone ? ` · ${d.profile.guardian_phone}` : ""} · ยืนยันการได้รับอนุญาตแล้ว`} full />}
                <Row label="ยินยอม PDPA" value={`เวอร์ชัน ${d.profile.pdpa_notice_version} · ${formatDateTimeTh(d.profile.pdpa_consented_at)}`} full />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">ยังไม่กรอกข้อมูลผู้เรียน</p>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Smartphone className="h-5 w-5" /> เซสชันล่าสุด</h2>
            {d.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่มีเซสชัน</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.sessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-muted-foreground">เข้าเมื่อ {formatDateTimeTh(s.created_at)} · ใช้ล่าสุด {formatDateTimeTh(s.last_seen_at)}</span>
                    {s.revoked_at ? <Badge variant="secondary">ยกเลิกแล้ว ({s.revoked_reason ?? "-"})</Badge> : s.expired ? <Badge variant="secondary">หมดอายุ</Badge> : <><Badge variant="success">ใช้งาน</Badge>{!u.is_system_owner && actor.id !== u.id && <DisconnectDevice path={`/api/admin/users/${u.id}/sessions/${s.id}`} />}</>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="p-6">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><GraduationCap className="h-5 w-5" /> การลงทะเบียนเรียน ({d.enrollments.length})</h2>
          {d.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่ลงทะเบียนเรียน</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4">หลักสูตร</th>
                    <th className="py-2 pr-4">สถานะ</th>
                    <th className="py-2 pr-4 text-right">เวลาเรียน</th>
                    <th className="py-2 pr-4 text-right">บทที่ผ่าน</th>
                    <th className="py-2 pr-4">ลงทะเบียน</th>
                    <th className="py-2 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {d.enrollments.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium"><Link href={`/courses/${e.slug}`} className="hover:underline">{e.title}</Link></td>
                      <td className="py-2 pr-4">{e.status === "completed" ? <Badge variant="success">จบแล้ว</Badge> : e.status === "revoked" ? <Badge variant="destructive">ถูกเพิกถอน</Badge> : <Badge variant="secondary">กำลังเรียน</Badge>}</td>
                      <td className="py-2 pr-4 text-right">{e.study_sec ? `${Math.floor(e.study_sec / 60)} นาที` : "—"}</td>
                      <td className="py-2 pr-4 text-right">{e.lessons_done}/{e.lessons_total}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{formatDateTimeTh(e.enrolled_at)}</td>
                      <td className="py-2 text-right">
                        <EnrollmentAdminActions
                          userId={u.id}
                          enrollmentId={e.id}
                          courseId={e.course_id}
                          currentStatus={e.status}
                          hasCertificate={d.certificates.some((c) => c.course_title_snapshot === e.title)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Award className="h-5 w-5" /> วุฒิบัตร ({d.certificates.length})</h2>
            {d.certificates.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีวุฒิบัตร</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.certificates.map((c) => (
                  <li key={c.certificate_code} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">{c.course_title_snapshot}</p>
                      <p className="text-xs text-muted-foreground">{c.certificate_code} · ออกเมื่อ {formatDateTimeTh(c.issued_at)}</p>
                    </div>
                    {c.revoked_at ? <Badge variant="destructive">เพิกถอนแล้ว</Badge> : <Badge variant="success">ใช้งานได้</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><BellRing className="h-5 w-5" /> รอบอบรม ({d.registrations.length})</h2>
            {d.registrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่สมัครรอบอบรม</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.registrations.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{r.program_title} · {r.cohort_title}</span>
                    <Badge variant={r.status === "approved" ? "success" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><ShieldAlert className="h-5 w-5" /> เหตุการณ์กันโกงล่าสุด ({d.flags.length})</h2>
            {d.flags.length === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่พบเหตุการณ์</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.flags.map((f) => (
                  <li key={f.id} className="py-2">
                    <p className="font-medium">{f.reason} · {f.lesson_title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTimeTh(f.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Mail className="h-5 w-5" /> ประวัติอีเมลล่าสุด ({d.emails.length})</h2>
            {d.emails.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีอีเมล</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.emails.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{e.template_key} · {formatDateTimeTh(e.created_at)}</span>
                    <Badge variant={e.status === "sent" ? "success" : e.status === "failed" ? "destructive" : "secondary"}>{e.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><History className="h-5 w-5" /> Audit log ล่าสุด ({d.auditLog.length})</h2>
            {d.auditLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่มีรายการ</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.auditLog.map((a) => (
                  <li key={a.id} className="py-2">
                    <p className="font-medium">{a.action}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTimeTh(a.created_at)}{a.ip_address ? ` · ${a.ip_address}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><KeyRound className="h-5 w-5" /> API token ({d.tokens.length})</h2>
            {d.tokens.length === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่มี token</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.tokens.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{t.name} · สร้าง {formatDateTimeTh(t.created_at)}</span>
                    {t.revoked_at ? <Badge variant="secondary">ยกเลิกแล้ว</Badge> : <Badge variant="success">ใช้งาน</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="p-6">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Fingerprint className="h-5 w-5" /> ตั้งค่าอีเมล</h2>
          {d.prefs ? (
            <div className="grid gap-1 text-sm text-muted-foreground">
              <p>ข่าวสารหลักสูตร: {d.prefs.course_updates_enabled ? "รับ" : "ไม่รับ"} · เตือนการเรียน: {d.prefs.learning_reminders_enabled ? "รับ" : "ไม่รับ"} · สรุปรายสัปดาห์: {d.prefs.weekly_summary_enabled ? "รับ" : "ไม่รับ"} · ภาษา: {d.prefs.preferred_locale === "en" ? "อังกฤษ" : "ไทย"}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">ยังไม่ตั้งค่า</p>
          )}
        </Card>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-4 w-4" /> แสดงข้อมูลล่าสุด · ข้อมูลส่วนตัวถูกจำกัดตามหลัก PDPA (เลขบัตรเก็บแบบเข้ารหัส แสดงเฉพาะ 4 ตัวท้าย)
        </p>
      </div>
    </div>
  );
}

const RESET_METHOD: Record<string, string> = {
  email_link: "ลิงก์ทางอีเมล",
  google_reauth: "ยืนยันตัวตนด้วย Google",
  admin_link: "ลิงก์ที่ผู้ดูแลสร้าง",
  forced_change: "บังคับเปลี่ยนหลังใช้รหัสชั่วคราว",
};

function Row({ label, value, full }: { label: string; value: string | null | undefined; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{value ?? "—"}</dd>
    </div>
  );
}
