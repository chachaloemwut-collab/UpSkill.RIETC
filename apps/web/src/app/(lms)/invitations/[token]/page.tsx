import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BadgeCheck, Clock3, ShieldX, UserPlus } from "lucide-react";
import { Card, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/common/PageHeader";
import { AcceptInvitationButton } from "@/components/admin/AcceptInvitationButton";
import { formatDateTimeTh } from "@/lib/format";
import { getInvitationView } from "@/server/admin/invitations.service";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "คำเชิญเป็นผู้สอน" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getInvitationView(token);
  if (!view) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/invitations/${token}`);

  const emailMatches = user.email.toLowerCase() === view.email.toLowerCase();

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="คำเชิญเป็นผู้สอน" description={`จาก ${view.inviterName} · หมดอายุ ${formatDateTimeTh(view.expiresAt)}`} />

      <Card className="p-6">
        {view.status === "accepted" ? (
          <div className="grid gap-3 text-center">
            <BadgeCheck className="mx-auto h-12 w-12 text-success" />
            <h2 className="text-lg font-semibold">ยอมรับคำเชิญแล้ว</h2>
            <p className="text-sm text-muted-foreground">บัญชีนี้มีสิทธิ์เป็นผู้สอนแล้ว เริ่มสร้างหลักสูตรได้เลย</p>
            <Link href="/instructor" className={buttonClass("default", "md")}>ไปที่แดชบอร์ดผู้สอน</Link>
          </div>
        ) : view.status === "revoked" ? (
          <div className="grid gap-3 text-center">
            <ShieldX className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="text-lg font-semibold">คำเชิญถูกยกเลิกแล้ว</h2>
            <p className="text-sm text-muted-foreground">ติดต่อผู้ดูแลระบบหากต้องการคำเชิญใหม่</p>
          </div>
        ) : view.status === "expired" ? (
          <div className="grid gap-3 text-center">
            <Clock3 className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">คำเชิญหมดอายุแล้ว</h2>
            <p className="text-sm text-muted-foreground">หมดอายุเมื่อ {formatDateTimeTh(view.expiresAt)} — ติดต่อผู้ดูแลระบบเพื่อเชิญใหม่</p>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-start gap-3">
              <UserPlus className="mt-1 h-5 w-5 shrink-0 text-primary" />
              <div className="grid gap-1 text-sm">
                <p><b>{view.inviterName}</b> เชิญคุณเป็นผู้สอนในระบบ UpskillReskill.RIETC</p>
                {view.message && <p className="rounded-lg bg-muted p-3 text-muted-foreground">“{view.message}”</p>}
                <p className="text-xs text-muted-foreground">สำหรับอีเมล: {view.email} · ใช้ได้ครั้งเดียว หมดอายุ {formatDateTimeTh(view.expiresAt)}</p>
              </div>
            </div>
            {emailMatches ? (
              <AcceptInvitationButton token={token} />
            ) : (
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
                <p className="font-semibold">อีเมลไม่ตรงกัน</p>
                <p className="mt-1 text-muted-foreground">
                  ขณะนี้คุณลงชื่อเข้าใช้ด้วย <b>{user.email}</b> — คำเชิญนี้ส่งถึง <b>{view.email}</b> กรุณาเข้าสู่ระบบด้วยอีเมลที่ได้รับเชิญ
                </p>
                <Link href={`/logout`} className="mt-2 inline-block text-sm font-medium text-primary hover:underline">สลับบัญชี</Link>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
