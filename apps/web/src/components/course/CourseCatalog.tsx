"use client";
import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { EmptyState, InputGroup, SegmentedControl, Select } from "@/components/ui";
import { createSearcher } from "@/lib/smart-search";
import { CourseCard, type CourseCardData } from "./CourseCard";

type Course = CourseCardData & { id: string; instructor_name: string; learner_count: number };
type Filter = "all" | "verified" | "community";
type Sort = "latest" | "popular" | "short" | "long";

export function CourseCatalog({ courses, initialQuery }: { courses: Course[]; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("latest");

  // Thai/English-aware fuzzy search from the design system (also matches text typed in the wrong keyboard layout)
  const search = useMemo(
    () => createSearcher(courses.map((c) => ({ label: c.title, description: c.description ?? "", keywords: [c.instructor_name], course: c }))),
    [courses],
  );

  const shown = useMemo(() => {
    let list = query.trim() ? search(query).hits.map((h) => h.item.course) : courses;
    if (filter !== "all") list = list.filter((c) => (filter === "verified" ? c.is_verified_course : !c.is_verified_course));
    if (sort === "popular") list = [...list].sort((a, b) => b.learner_count - a.learner_count);
    if (sort === "short") list = [...list].sort((a, b) => a.total_duration_sec - b.total_duration_sec);
    if (sort === "long") list = [...list].sort((a, b) => b.total_duration_sec - a.total_duration_sec);
    return list;
  }, [courses, query, filter, sort, search]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup
          prefix={<Search className="h-4 w-4" />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อหลักสูตร ผู้สอน หรือหัวข้อ…"
          aria-label="ค้นหาหลักสูตร"
          className="w-full sm:w-80"
        />
        <SegmentedControl
          value={filter}
          onValueChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "all", label: "ทั้งหมด" },
            { value: "verified", label: "Verified" },
            { value: "community", label: "Community" },
          ]}
        />
        <div className="ml-auto w-44">
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)} aria-label="เรียงลำดับ">
            <option value="latest">ล่าสุด</option>
            <option value="popular">ผู้เรียนมากที่สุด</option>
            <option value="short">ใช้เวลาน้อยที่สุด</option>
            <option value="long">ใช้เวลามากที่สุด</option>
          </Select>
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<SearchX className="h-5 w-5" />} title="ไม่พบหลักสูตรที่ตรงกับการค้นหา" description="ลองใช้คำค้นอื่น หรือเปลี่ยนตัวกรอง" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((c, i) => (
            <CourseCard key={c.id} course={c} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
