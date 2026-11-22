import { Suspense } from "react";
import { RouteLoading } from "@/components/brand/RouteLoading";
import type { Metadata } from "next";
import { PageHeader } from "@/components/common/PageHeader";
import { CourseCatalog } from "@/components/course/CourseCatalog";
import { listPublishedCourses } from "@/server/courses/courses.service";

export const metadata: Metadata = { title: "คลังหลักสูตร" };
export const dynamic = "force-dynamic";

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q, type } = await searchParams;
  return (
    <Suspense fallback={<RouteLoading word="dot-juggling">กำลังเตรียมข้อมูลหลักสูตร</RouteLoading>}>
      <CatalogResults query={q} courseType={type} />
    </Suspense>
  );
}

async function CatalogResults({ query: q, courseType: type }: { query: string | undefined; courseType: string | undefined }) {
  const courses = await listPublishedCourses();
  return (
    <>
      <PageHeader title="คลังหลักสูตร" description={`หลักสูตรที่เปิดให้ลงทะเบียน ${courses.length.toLocaleString("th-TH")} หลักสูตร · ดูบทเรียน ทำแบบทดสอบ และรับวุฒิบัตรตามเกณฑ์`} />
      <CourseCatalog courses={courses} initialQuery={typeof q === "string" ? q.slice(0, 100) : ""} initialType={type === "short_course" || type === "certified_training" ? type : "all"} />
    </>
  );
}
