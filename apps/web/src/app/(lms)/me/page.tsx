import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell, CheckCircle2, Database, IdCard, KeyRound, Link2, Lock, Mail, UserRound } from "lucide-react";
import { Alert, Avatar, Badge, Card, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { EmailPreferencesForm } from "@/components/account/EmailPreferencesForm";
import { DataRights } from "@/components/account/DataRights";
import { ApiTokens } from "@/components/account/ApiTokens";
import { LockLegalNameForm } from "@/components/course/CertificatePanel";
import { UserEmailsManager } from "@/components/account/UserEmailsManager";
import { ROLE_LABEL, formatDateTh, formatDateTimeTh } from "@/lib/format";
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
  const { db } = ctx();
  const me = await db
    .selectFrom("users")
    .select(["email", "username", "is_system_owner", "role", "legal_full_name_th", "legal_full_name_en", "legal_name_locked_at", "password_hash", "email_verified_at", "created_at"])
    .where("id", "=", viewer.id)
    .executeTakeFirstOrThrow();
  const google = await db.selectFrom("user_oauth_accounts").select(["provider_email"]).where("user_id", "=", viewer.id).where("provider", "=", "google").executeTakeFirst();
  const emailPreferences = await emailPreferenceSummary(viewer.id);
  const instructorInvitation = me.role === "member" ? await getMyPendingInvitation(me.email) : null;
  const userEmails = await listUserEmails(viewer.id);

  return (
    <div className="mx-auto max-w-4xl">
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

      <div className="grid gap-6">
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

        <Section icon={<Mail className="h-4 w-4" />} title="อีเมลของบัญชี" description="จัดการอีเมลหลักและอีเมลสำรองสำหรับเข้าสู่ระบบและรับการแจ้งเตือน (ต้องมีอย่างน้อยหนึ่งอีเมลเสมอ)">
          <UserEmailsManager initialEmails={userEmails} />
        </Section>

        <Section icon={<IdCard className="h-4 w-4" />} title="ข้อมูลผู้เรียน" description="ชื่อ-นามสกุล ไทย/อังกฤษ เลขประจำตัวประชาชน วันเกิด เบอร์โทรศัพท์ และที่อยู่">
          <Card className="flex flex-wrap items-center gap-3 p-5">
            {viewer.hasProfile ? <Badge variant="success">กรอกครบแล้ว</Badge> : <Badge variant="warning">ยังไม่ได้กรอก</Badge>}
            <span className="flex-1 text-sm text-muted-foreground">จัดเก็บตามประกาศความเป็นส่วนตัว (PDPA) เลขประจำตัวประชาชนถูกเข้ารหัส</span>
            <Link href="/me/profile" className={buttonClass(viewer.hasProfile ? "outline" : "default", "sm")}>{viewer.hasProfile ? "แก้ไขข้อมูล" : "กรอกข้อมูล"}</Link>
          </Card>
        </Section>

        <Section icon={<UserRound className="h-4 w-4" />} title="ชื่อบนวุฒิบัตร" description="ชื่อจริงตามบัตรประชาชน ใช้พิมพ์บนวุฒิบัตรทุกใบ">
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
          title={me.password_hash ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่าน"}
          description={me.password_hash ? "เมื่อเปลี่ยนรหัสผ่าน อุปกรณ์อื่นจะถูกออกจากระบบ" : "บัญชีนี้เข้าสู่ระบบด้วย Google ตั้งรหัสผ่านเพื่อเข้าสู่ระบบด้วยอีเมลได้ด้วย"}
        >
          <Card className="p-5">
            <ChangePasswordForm hasPassword={!!me.password_hash} canEmailReset={!me.is_system_owner && !me.email.endsWith(".invalid")} />
          </Card>
        </Section>

        {!me.is_system_owner && (
          <Section icon={<Bell className="h-4 w-4" />} title="การแจ้งเตือนทางอีเมล" description="กำหนดการแจ้งเตือนเสริมที่ต้องการรับ">
            <EmailPreferencesForm defaults={emailPreferences} />
          </Section>
        )}

        {(await isGoogleEnabled()) && (
          <Section icon={<Link2 className="h-4 w-4" />} title="บัญชีที่เชื่อมต่อ" description="ใช้เข้าสู่ระบบ และยืนยันตัวตนเมื่อลืมรหัสผ่าน">
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
        <Section icon={<Database className="h-5 w-5" />} title="ข้อมูลและความเป็นส่วนตัว" description="ดาวน์โหลดข้อมูลของคุณ หรือขอลบบัญชีตามสิทธิของเจ้าของข้อมูล (พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล)">
          <Card className="p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              คุณดาวน์โหลดข้อมูลส่วนบุคคลที่ระบบเก็บไว้ได้ และขอลบบัญชีได้ตลอด การลบบัญชีจะลบข้อมูลที่ระบุตัวตน
              แต่คงวุฒิบัตรและบันทึกการตรวจสอบที่จำเป็นต่อการยืนยันเอกสารไว้
            </p>
            <DataRights />
          </Card>
        </Section>
        <Section icon={<KeyRound className="h-5 w-5" />} title="API token (MCP)" description="สร้าง token ส่วนตัวสำหรับเชื่อม AI เช่น Cursor หรือ Claude Desktop ผ่าน MCP ตามสิทธิ์บัญชีของคุณ">
          <Card className="p-6">
            <ApiTokens />
          </Card>
        </Section>
      </div>
    </div>
  );
}

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          {icon} {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
