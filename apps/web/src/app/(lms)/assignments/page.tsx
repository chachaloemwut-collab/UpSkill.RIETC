import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { AssignmentManager } from "@/components/assignments/AssignmentManager";
import { getCurrentUser } from "@/server/auth/session";
import { assignmentOverview } from "@/server/assignments/assignment.service";

export const metadata: Metadata = { title: "มอบหมายหลักสูตร", robots: { index: false } };

export default async function AssignmentsPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "instructor" && user.role !== "admin")) redirect("/");
  return <Suspense fallback={<LoadingSkeleton label="กำลังโหลดงานมอบหมาย" />}><Assignments user={user} /></Suspense>;
}

async function Assignments({ user }: { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }) {
  const data = await assignmentOverview(user);
  return <><PageHeader title="มอบหมายหลักสูตร" description="จัดกลุ่มผู้เรียน มอบหมายหลักสูตร และติดตามสถานะรายการ" /><AssignmentManager {...data} /></>;
}
