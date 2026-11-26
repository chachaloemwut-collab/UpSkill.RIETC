import { maskEmail } from "@/lib/mask-email";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell, CheckCircle2, Database, IdCard, KeyRound, Link2, Lock, Mail, UserRound } from "lucide-react";
import { Alert, Avatar, Badge, Card, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { EmailPreferencesForm } from "@/components/account/EmailPreferencesForm";
import { DataRights } from "@/components/account/DataRights";
import { listMyDevices } from "@/server/auth/device-sessions";
import { ContactEditor } from "@/components/account/ContactEditor";
import { DisconnectDevice } from "@/components/account/DisconnectDevice";
import { ApiTokens } from "@/components/account/ApiTokens";
import { LockLegalNameForm } from "@/components/course/CertificatePanel";
import { UserEmailsManager } from "@/components/account/UserEmailsManager";
import { ROLE_LABEL, formatDateTh, formatDateTimeTh } from "@/lib/format";
import { APP_VERSION } from "@/lib/version";
import { ctx } from "@/server/context";
import { isGoogleEnabled } from "@/server/auth/google";
import { getViewer } from "@/server/viewer";
import { listUserEmails } from "@/server/auth/user-emails.service";
import { emailPreferenceSummary } from "@/server/email/outbox.service";
import { getMyPendingInvitation } from "@/server/admin/invitations.service";

export const metadata: Metadata = { title: "ตั้งค่าบัญชี" };

export default async function MePage({ searchParams }: { searchParams: Promise<{ linked?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { linked } = await searchParams;
  return <Suspense fallback={<LoadingSkeleton label="กำลังโหลดบัญชีสมาชิก" />}><AccountDetails viewer={viewer} linked={linked} /></Suspense>;
}

async function AccountDetails({ viewer, linked }: { viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>>; linked: string | undefined }) {
  const { db } = ctx();
  const [me, google, emailPreferences, instructorInvitation, contact, devices, userEmails, googleEnabled] = await Promise.all([
    db
    .selectFrom("users")
    .select(["email", "username", "is_system_owner", "role", "legal_full_name_th", "legal_full_name_en", "legal_name_locked_at", "password_hash", "email_verified_at", "created_at"])
    .where("id", "=", viewer.id)
    .executeTakeFirstOrThrow(),
    db.selectFrom("user_oauth_accounts").select(["provider_email"]).where("user_id", "=", viewer.id).where("provider", "=", "google").executeTakeFirst(),
    emailPreferenceSummary(viewer.id),
    viewer.role === "member" ? getMyPendingInvitation(viewer.email) : null,
    db.selectFrom("user_profiles").select(["phone", "address_line as addressLine", "subdistrict", "district", "province", "postal_code as postalCode"]).where("user_id", "=", viewer.id).executeTakeFirst(),
    listMyDevices(viewer),
    listUserEmails(viewer.id),
    isGoogleEnabled(),
  ]);

  const grant = await db.selectFrom("management_grants").select("id").where("user_id","=",viewer.id).where("revoked_at","is",null)
    .where("starts_at","<=",new Date()).where(eb=>eb.or([eb("expires_at","is",null),eb("expires_at",">",new Date())])).executeTakeFirst();
  return (
    <div className="mx-auto max-w-4xl">
      {(grant || viewer.role==="admin") && <Link href="/management" className={buttonClass("outline")}>เปิดตารางจัดการงานที่รับผิดชอบ</Link>}
      <PageHeader title="ตั้งค่าบัญชี" description="ข้อมูลส่วนตัว ชื่อบนวุฒิบัตร และความปลอดภัยของบัญชี" />
      {linked === "google" && (
        <div className="mb-6">
          <Alert variant="success" title="ผูกบัญชี Google เรียบร้อยแล้ว" />
        </div>
      )}
      {instructorInvitation && (
        <div className="mb-6 grid gap-2">
          <Alert variant="success" title={`คุณได้รับเชิญเป็นผู้สอนจาก ${instructorInvitation.inviterName}`}>
            หมดอายุ {formatDateTimeTh(instructorInvitation.expiresAt)} — กดดูคำเชิญเพื่อยอมรับและเริ่มสร้างหลักสูตรได้ทันที
          </Alert>
          <Link href={instructorInvitation.link} className={buttonClass("default", "md")}>ดูคำเชิญ</Link>
        </div>
      )}

      <div id="account-index" className="account-index grid gap-6">
        <Card className="flex flex-wrap items-center gap-4 p-6">
          <Avatar name={viewer.name} size={64} className="text-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{viewer.name}</p>
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" /> {me.username ?? me.email}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary">{ROLE_LABEL[me.role] ?? me.role}</Badge>
              {me.is_system_owner && <Badge variant="success">เจ้าของระบบ</Badge>}
              {me.email_verified_at && (
                <Badge variant="success">
                  <CheckCircle2 className="h-3 w-3" /> ยืนยันอีเมลแล้ว
                </Badge>
              )}
              <Badge variant="outline">สมาชิกตั้งแต่ {formatDateTh(me.created_at)}</Badge>
            </div>
          </div>
        </Card>

        <Section icon={<Mail className="h-4 w-4" />} id="emails" title="อีเมลของบัญชี" description="จัดการอีเมลหลักและอีเมลสำรองสำหรับเข้าสู่ระบบและรับการแจ้งเตือน (ต้องมีอย่างน้อยหนึ่งอีเมลเสมอ)">
          <UserEmailsManager initialEmails={userEmails} />
        </Section>

        <Section icon={<IdCard className="h-4 w-4" />} id="profile" title="ข้อมูลผู้เรียน" description="ชื่อ-นามสกุล ไทย/อังกฤษ เลขประจำตัวประชาชน วันเกิด เบอร์โทรศัพท์ และที่อยู่">
          <Card className="flex flex-wrap items-center gap-3 p-5">
            {viewer.hasProfile ? <Badge variant="success">กรอกครบแล้ว</Badge> : <Badge variant="warning">ยังไม่ได้กรอก</Badge>}
            <span className="flex-1 text-sm text-muted-foreground">จัดเก็บตามประกาศความเป็นส่วนตัว (PDPA) เลขประจำตัวประชาชนถูกเข้ารหัส</span>
            {contact && <ContactEditor contact={contact} />}
            <Link href="/me/profile" className={buttonClass(viewer.hasProfile ? "outline" : "default", "sm")}>{viewer.hasProfile ? "แก้ไขข้อมูล" : "กรอกข้อมูล"}</Link>
          </Card>
        </Section>

        <Section icon={<UserRound className="h-4 w-4" />} id="credential" title="ชื่อบนวุฒิบัตร" description="ชื่อจริงตามบัตรประชาชน ใช้พิมพ์บนวุฒิบัตรทุกใบ">
          {me.legal_name_locked_at ? (
            <Card className="grid gap-3 p-5">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">ภาษาไทย</dt>
                  <dd className="font-medium">{me.legal_full_name_th ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">English</dt>
                  <dd className="font-medium">{me.legal_full_name_en ?? "—"}</dd>
                </div>
              </dl>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> ล็อกแล้วเมื่อ {formatDateTh(me.legal_name_locked_at)} · หากชื่อผิดพลาด กรุณาติดต่อผู้ดูแลระบบ
              </p>
            </Card>
          ) : (
            <LockLegalNameForm defaultTh={me.legal_full_name_th} defaultEn={me.legal_full_name_en} />
          )}
        </Section>

        <Section
          icon={<KeyRound className="h-4 w-4" />}
          id="password" title={me.password_hash ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่าน"}
          description={me.password_hash ? "เมื่อเปลี่ยนรหัสผ่าน อุปกรณ์อื่นจะถูกออกจากระบบ" : "บัญชีนี้เข้าสู่ระบบด้วย Google ตั้งรหัสผ่านเพื่อเข้าสู่ระบบด้วยอีเมลได้ด้วย"}
        >
          <Card className="p-5">
            <ChangePasswordForm destinations={userEmails.filter(e => e.verified_at && !e.email.endsWith(".invalid")).map(e => ({ id: e.id, label: maskEmail(e.email), primary: e.is_primary }))} hasPassword={!!me.password_hash} canEmailReset={!me.is_system_owner && !me.email.endsWith(".invalid")} />
          </Card>
        </Section>

        <Section id="devices" icon={<KeyRound className="h-4 w-4" />} title="อุปกรณ์ที่เข้าสู่ระบบ" description="ตรวจสอบการใช้งานล่าสุดและออกจากระบบเฉพาะอุปกรณ์ที่เลือก">
          <Card className="divide-y px-4">{devices.map(device => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="break-words text-sm">{device.user_agent?.match(/iPhone|iPad|Android|Windows|Macintosh|Linux/i)?.[0] ?? "อุปกรณ์"} · {device.user_agent?.match(/Edg|Firefox|Chrome|Safari/i)?.[0] ?? "เบราว์เซอร์"}</p><p className="text-xs text-muted-foreground">ใช้งานล่าสุด {formatDateTimeTh(device.last_seen_at)}</p></div>
            {device.id === viewer.sessionId ? <Badge>อุปกรณ์ปัจจุบัน</Badge> : <DisconnectDevice path={`/api/user/sessions/${device.id}`} />}
          </div>)}</Card>
        </Section>

        {!me.is_system_owner && (
          <Section icon={<Bell className="h-4 w-4" />} id="notifications" title="การแจ้งเตือนทางอีเมล" description="กำหนดการแจ้งเตือนเสริมที่ต้องการรับ">
            <EmailPreferencesForm defaults={emailPreferences} />
          </Section>
        )}

        {googleEnabled && (
          <Section icon={<Link2 className="h-4 w-4" />} id="connections" title="บัญชีที่เชื่อมต่อ" description="ใช้เข้าสู่ระบบ และยืนยันตัวตนเมื่อลืมรหัสผ่าน">
            <Card className="flex flex-wrap items-center gap-3 p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-md border font-semibold">G</span>
              <div className="mr-auto">
                <p className="text-sm font-medium">Google</p>
                <p className="text-xs text-muted-foreground">{google ? `ผูกกับ ${google.provider_email}` : "ยังไม่ได้เชื่อมต่อ"}</p>
              </div>
              {google ? (
                <Badge variant="success">เชื่อมต่อแล้ว</Badge>
              ) : (
                <a href="/api/auth/google?mode=link" className={buttonClass("outline", "sm")}>
                  ผูกบัญชี Google
                </a>
              )}
            </Card>
          </Section>
        )}
        <Section icon={<Database className="h-5 w-5" />} id="privacy" title="ข้อมูลและความเป็นส่วนตัว" description="จัดการข้อมูลส่วนบุคคลของบัญชีนี้">
          <Card className="p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              {me.is_system_owner ? "คุณดาวน์โหลดข้อมูลส่วนบุคคลได้ บัญชีเจ้าของระบบสงวนไว้สำหรับดูแลระบบ" : "คุณดาวน์โหลดข้อมูลส่วนบุคคลและขอลบบัญชีได้ ระบบจะลบข้อมูลที่ระบุตัวตนและเก็บวุฒิบัตรกับบันทึกที่จำเป็นต่อการยืนยันเอกสาร"}
            </p>
            <DataRights allowDelete={!me.is_system_owner} />
          </Card>
        </Section>
        <Section icon={<KeyRound className="h-5 w-5" />} id="tokens" title="API token (MCP)" description="สร้าง token ส่วนตัวสำหรับเชื่อม AI เช่น Cursor หรือ Claude Desktop ผ่าน MCP ตามสิทธิ์บัญชีของคุณ">
          <Card className="p-6">
            <ApiTokens />
          </Card>
        </Section>
        {/* Which release is running: quote it when reporting a problem */}
        <p className="text-center text-xs text-muted-foreground">
          เวอร์ชันระบบ <span className="font-mono">{APP_VERSION}</span> · แจ้งเลขนี้เมื่อพบปัญหาการใช้งาน
        </p>
      </div>
    </div>
  );
}

function Section({ id, icon, title, description, children }: { id: string; icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <><a className="account-task" href={`#${id}`}>{icon}<span>{title}</span><span aria-hidden>›</span></a>
    <section id={id} className="account-screen grid gap-4 lg:grid-cols-[240px_1fr]">
      <a href="#account-index" className="account-return">‹ ตั้งค่าบัญชี</a>
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          {icon} {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section></>
  );
}
