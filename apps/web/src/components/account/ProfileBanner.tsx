import Link from "next/link";
import { UserRoundPen } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** Shown on every signed-in page until the member profile is complete (members created via Google or before profiles) */
export function ProfileBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <UserRoundPen className="h-4 w-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1">กรุณากรอกข้อมูลผู้เรียน (ชื่อ-นามสกุล เลขประจำตัวประชาชน เบอร์โทรศัพท์ และที่อยู่) ให้ครบก่อนลงทะเบียนเรียนหรือสมัครรอบอบรม</span>
      <Link href="/me/profile" className={buttonClass("default", "sm")}>กรอกข้อมูล</Link>
    </div>
  );
}

/** Learners only: the profile is required to enrol, so staff (instructors/admins) are not nagged on every page */
export const needsProfile = (v: { isSystemOwner: boolean; hasProfile: boolean; role?: string } | null) =>
  !!v && !v.isSystemOwner && !v.hasProfile && (v.role === undefined || v.role === "member");
