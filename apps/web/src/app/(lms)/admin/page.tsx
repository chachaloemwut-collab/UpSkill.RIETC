import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, BadgeCheck, Ban, BookOpen, CalendarCheck, ClipboardList, Flag, GraduationCap, Mail, Megaphone, Rss, Settings, ShieldAlert, UserCog, Users } from "lucide-react";
import { Badge, Card, EmptyState, Table, Tabs, TabsContent, TabsList, TabsTrigger, buttonClass } from "@/components/ui";
import { AdminCreateCourseDialog } from "@/components/admin/CourseOwnerActions";
import { AdminInvitations } from "@/components/admin/AdminInvitations";
import { listInstructors } from "@/server/courses/instructor.service";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { AutomationPanel, CertificateDisplayForm, CourseAdminControls, CourseDefaultsForm, EmailSettingsForm, GoogleOAuthSettingsForm, RemoveSuppressionButton, RetryEmailButton, RevokeCertificateForm, TestEmailSettingsForm, UserAdminForm } from "@/components/admin/AdminActions";
import { VISIBILITY, formatDateTimeTh } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { adminOverview } from "@/server/admin/admin.service";
import { getEmailSettingsView } from "@/server/admin/email-settings.service";
import { getGoogleOAuthSettingsView } from "@/server/settings/google-oauth.service";
import { getCertificateDisplay, getCourseDefaults } from "@/server/system-settings.service";
import { getAutomationFlags, getAutomationBacklog } from "@/server/automation.service";

export const metadata: Metadata = { title: "ผู้ดูแลระบบ", robots: { index: false } };

const REASONS: Record<string, string> = { POSITION_JUMP: "กรอข้าม / เร่งความเร็ว", POSITION_OUT_OF_RANGE: "ตำแหน่งเกินความยาวคลิป" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  const [{ courses, flags, topFlagged, stats, emails, suppressions }, emailSettings, googleSettings, instructors, courseDefaults, automationFlags, automationBacklog, certificateDisplay] = await Promise.all([adminOverview(), getEmailSettingsView(), getGoogleOAuthSettingsView(), listInstructors(), getCourseDefaults(), getAutomationFlags(), getAutomationBacklog(), getCertificateDisplay()]);

  return (
    <>
      <PageHeader title="ภาพรวมระบบ" description="ดูแลหลักสูตร ผู้ใช้ ใบรับรอง และพฤติกรรมผิดปกติ">
        <Link href="/admin/users" className={buttonClass("outline")}><Users className="h-4 w-4" /> สมาชิก</Link>
        <Link href="/admin/certificates" className={buttonClass("outline")}><Award className="h-4 w-4" /> ใบประกาศ</Link>
        <Link href="/admin/programs" className={buttonClass("outline")}><GraduationCap className="h-4 w-4" /> หลักสูตรอบรม</Link>
        <Link href="/admin/announcements" className={buttonClass("outline")}><Megaphone className="h-4 w-4" /> ประกาศ</Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard index={0} label="ผู้ใช้ทั้งหมด" value={stats.users} unit="คน" icon={<Users />} />
        <StatCard index={1} label="หลักสูตรที่เผยแพร่" value={stats.publishedCourses} unit="หลักสูตร" icon={<BookOpen />} />
        <StatCard index={2} label="การลงทะเบียน" value={stats.enrollments} unit="ครั้ง" icon={<GraduationCap />} />
        <StatCard index={3} label="ใบรับรองที่ใช้งานได้" value={stats.certificates} unit="ใบ" icon={<Award />} />
        <StatCard index={4} label="ผิดปกติ (7 วัน)" value={stats.flags7d} unit="ครั้ง" icon={<Flag />} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Link href="/admin/programs" className="block"><StatCard index={5} label="หลักสูตรอบรมที่เผยแพร่" value={stats.publishedPrograms} unit="หลักสูตร" icon={<GraduationCap />} /></Link>
        <Link href="/admin/programs" className="block"><StatCard index={6} label="รอบที่เปิดรับสมัคร" value={stats.openCohorts} unit="รอบ" icon={<CalendarCheck />} /></Link>
        <Link href="/admin/programs" className="block"><StatCard index={7} label="ใบสมัครรอพิจารณา" value={stats.pendingRegistrations} unit="ใบ" hint={stats.pendingRegistrations ? "เปิดหลักสูตรเพื่อพิจารณา" : undefined} icon={<ClipboardList />} /></Link>
      </div>

      <Tabs defaultValue="courses" className="mt-8">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="courses">หลักสูตร ({courses.length})</TabsTrigger>
          <TabsTrigger value="flags">พฤติกรรมผิดปกติ</TabsTrigger>
          <TabsTrigger value="users">ผู้ใช้</TabsTrigger>
          <TabsTrigger value="invitations">เชิญผู้สอน</TabsTrigger>
          <TabsTrigger value="certs">ใบรับรอง</TabsTrigger>
          <TabsTrigger value="email">อีเมลและ Google ({stats.emailPending}/{stats.emailFailed})</TabsTrigger>
          <TabsTrigger value="settings">ตั้งค่าระบบ</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="mt-4">
          <div className="mb-3 flex justify-end"><AdminCreateCourseDialog instructors={instructors} selfId={user.id} /></div>
          {courses.length === 0 ? (
            <EmptyState icon={<BookOpen className="h-5 w-5" />} title="ยังไม่มีหลักสูตร" />
          ) : (
            <Table className="[&_td]:py-2">
              <thead>
                <tr>
                  <th>หลักสูตร</th>
                  <th>ผู้สอน</th>
                  <th>สถานะ</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => {
                  const vis = VISIBILITY[c.visibility];
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/courses/${c.slug}`} className="inline-flex max-w-sm items-center gap-1.5 font-medium hover:underline">
                          <span className="truncate">{c.title}</span>
                          {c.is_verified_course && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-success" aria-label="Verified" />}
                        </Link>
                      </td>
                      <td className="text-muted-foreground">{c.instructor_email}</td>
                      <td>
                        <Badge variant={vis?.variant ?? "secondary"}>{vis?.label ?? c.visibility}</Badge>
                      </td>
                      <td className="text-right">
                        <CourseAdminControls courseId={c.id} title={c.title} visibility={c.visibility} verified={c.is_verified_course} instructorId={c.instructor_id} instructors={instructors} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="flags" className="mt-4">
          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            {flags.length === 0 ? (
              <EmptyState icon={<ShieldAlert className="h-5 w-5" />} title="ไม่พบพฤติกรรมผิดปกติ" description="ระบบจะบันทึกเมื่อพบการกรอข้ามหรือเร่งความเร็ววิดีโอ" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>ผู้ใช้</th>
                    <th>ประเภท</th>
                    <th>บทเรียน</th>
                  </tr>
                </thead>
                <tbody>
                  {flags.map((f) => (
                    <tr key={String(f.id)}>
                      <td className="text-muted-foreground">{formatDateTimeTh(f.created_at)}</td>
                      <td>{f.email}</td>
                      <td>
                        <Badge variant="warning">{REASONS[f.reason] ?? f.reason}</Badge>
                      </td>
                      <td className="max-w-xs truncate text-muted-foreground">{f.lesson_title}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Card className="self-start p-5">
              <h3 className="font-semibold">ผู้ใช้ที่ถูก flag บ่อย</h3>
              <p className="mb-4 text-xs text-muted-foreground">30 วันล่าสุด</p>
              {topFlagged.length === 0 ? (
                <p className="text-sm text-muted-foreground">ไม่มีข้อมูล</p>
              ) : (
                <ol className="grid gap-2.5">
                  {topFlagged.map((u, i) => (
                    <li key={u.id} className="flex items-center gap-3 text-sm">
                      <span className="w-4 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{u.email}</span>
                      <Badge variant={u.n >= 10 ? "destructive" : "secondary"} className="tabular-nums">
                        {u.n}
                      </Badge>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card className="max-w-xl p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <UserCog className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold">เปลี่ยนบทบาทหรือสถานะผู้ใช้</h3>
                  <p className="text-sm text-muted-foreground">ทุกการเปลี่ยนแปลงจะบันทึกใน audit log และผู้ใช้จะถูกออกจากระบบ</p>
                </div>
              </div>
              <Link href="/admin/users" className={buttonClass("outline", "sm")}>
                จัดการสมาชิกโดยละเอียด
              </Link>
            </div>
            <UserAdminForm />
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="mt-4">
          <div className="max-w-2xl">
            <AdminInvitations />
          </div>
        </TabsContent>

        <TabsContent value="certs" className="mt-4">
          <Card className="max-w-xl p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <Ban className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold">เพิกถอนใบรับรอง</h3>
                  <p className="text-sm text-muted-foreground">ใช้เมื่อพบการทุจริต หน้าตรวจสอบสาธารณะจะแสดงสถานะถูกเพิกถอนพร้อมเหตุผล</p>
                </div>
              </div>
              <Link href="/admin/certificates" className={buttonClass("outline", "sm")}>
                ศูนย์จัดการใบประกาศ
              </Link>
            </div>
            <RevokeCertificateForm />
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-4 grid gap-6">
          <Card>
            <div className="flex items-center gap-3 border-b px-5 py-4"><Mail className="h-5 w-5" /><div><h3 className="font-semibold">การเข้าสู่ระบบด้วย Google</h3><p className="text-xs text-muted-foreground">ตั้งค่าการสมัครสมาชิกและเข้าสู่ระบบด้วยบัญชี Google ภายหลังได้จากหน้านี้</p></div></div>
            <GoogleOAuthSettingsForm defaults={googleSettings} />
          </Card>
          <Card>
            <div className="flex items-center gap-3 border-b px-5 py-4"><Mail className="h-5 w-5" /><div><h3 className="font-semibold">ตั้งค่าอีเมลระบบ</h3><p className="text-xs text-muted-foreground">ผู้ส่ง การตอบกลับ และการเชื่อมต่อ SMTP · รหัสผ่านจะถูกเข้ารหัสก่อนจัดเก็บ</p></div></div>
            <EmailSettingsForm defaults={emailSettings} />
            <TestEmailSettingsForm lastStatus={emailSettings.lastTestStatus} lastError={emailSettings.lastTestError} />
          </Card>
          <Card>
            <div className="flex items-center gap-3 border-b px-5 py-4"><Mail className="h-5 w-5" /><div><h3 className="font-semibold">ประวัติการส่งอีเมล</h3><p className="text-xs text-muted-foreground">รอส่ง {stats.emailPending} · ล้มเหลว {stats.emailFailed}</p></div></div>
            <Table><thead><tr><th>สร้างเมื่อ</th><th>ผู้รับ</th><th>ประเภท</th><th>สถานะ</th><th>ครั้ง</th><th /></tr></thead><tbody>{emails.map((email) => <tr key={email.id}><td>{formatDateTimeTh(email.created_at)}</td><td>{email.recipient_email}</td><td>{email.template_key}</td><td><Badge variant={email.status === "sent" ? "success" : email.status === "failed" ? "destructive" : email.status === "suppressed" ? "warning" : "secondary"}>{email.status}</Badge></td><td>{email.attempt_count}</td><td className="text-right">{(email.status === "failed" || email.status === "suppressed") && <RetryEmailButton id={email.id} />}</td></tr>)}</tbody></Table>
          </Card>
          <Card>
            <div className="border-b px-5 py-4"><h3 className="font-semibold">อีเมลที่ถูกระงับ</h3><p className="text-xs text-muted-foreground">เกิดจาก hard bounce, complaint หรือการระงับโดยผู้ดูแล</p></div>
            {suppressions.length ? <Table><thead><tr><th>อีเมล</th><th>เหตุผล</th><th>เมื่อ</th><th /></tr></thead><tbody>{suppressions.map((item) => <tr key={item.email}><td>{item.email}</td><td>{item.reason}</td><td>{formatDateTimeTh(item.created_at)}</td><td className="text-right"><RemoveSuppressionButton email={item.email} /></td></tr>)}</tbody></Table> : <p className="p-5 text-sm text-muted-foreground">ไม่มีอีเมลที่ถูกระงับ</p>}
          </Card>
        </TabsContent>
        <TabsContent value="settings" className="mt-4 grid gap-6">
          <Card className="max-w-2xl">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <Settings className="h-5 w-5" />
              <div>
                <h3 className="font-semibold">ค่าเริ่มต้นของหลักสูตร</h3>
                <p className="text-xs text-muted-foreground">ใช้กับหลักสูตรที่สร้างใหม่ — ผู้สอนสามารถปรับได้ในแต่ละหลักสูตร</p>
              </div>
            </div>
            <CourseDefaultsForm defaults={courseDefaults} />
          </Card>
          <Card className="max-w-2xl">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <Award className="h-5 w-5" />
              <div>
                <h3 className="font-semibold">รูปแบบวุฒิบัตร</h3>
                <p className="text-xs text-muted-foreground">หน่วยงานผู้ออกเอกสาร ใช้กับทุกหลักสูตร</p>
              </div>
            </div>
            <CertificateDisplayForm defaults={certificateDisplay} />
          </Card>
          <Card className="max-w-2xl">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <Rss className="h-5 w-5" />
              <div>
                <h3 className="font-semibold">งานอัตโนมัติ</h3>
                <p className="text-xs text-muted-foreground">พัก/เปิดการทำงานอัตโนมัติ และดู backlog ปัจจุบัน</p>
              </div>
            </div>
            <AutomationPanel paused={automationFlags.paused} backlog={automationBacklog} />
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
