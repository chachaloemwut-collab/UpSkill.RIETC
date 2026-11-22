"use client";
import { BrandSignal } from "@/components/brand/BrandActivity";
import { useBrandPulse } from "@/components/brand/BrandActivity";
import { useMemo, useState, useSyncExternalStore } from "react";
import { LayoutGrid, List, RotateCcw, Search, SearchX } from "lucide-react";
import { Button, EmptyState, InputGroup, SegmentedControl, Select } from "@/components/ui";
import { createSearcher } from "@/lib/smart-search";
import { CourseCard, type CourseCardData } from "./CourseCard";
import { cn } from "@/lib/utils";
import { COURSE_TYPES, COURSE_TYPE_INFO, asCourseType, type CourseType } from "@upskill/core/application";

type Course = CourseCardData & { id: string; instructor_name: string; learner_count: number };
type Filter = "all" | "verified" | "community";
type Sort = "latest" | "popular" | "short" | "long";
type ViewMode = "grid" | "list";

const VIEW_STORAGE_KEY = "vec-course-view";
const subscribeView = () => () => {};
function readViewMode(): ViewMode {
  try {
    const s = localStorage.getItem(VIEW_STORAGE_KEY);
    return s === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

type TypeFilter = "all" | CourseType;

export function CourseCatalog({ courses, initialQuery, initialType = "all" }: { courses: Course[]; initialQuery: string; initialType?: TypeFilter }) {
  const pulse = useBrandPulse();
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<TypeFilter>(initialType);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("latest");

  const storedView = useSyncExternalStore(subscribeView, readViewMode, () => "grid");
  const [overrideView, setOverrideView] = useState<ViewMode | null>(null);
  const viewMode = overrideView ?? storedView;

  const switchView = (mode: ViewMode) => {
    setOverrideView(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      /* storage unavailable */
    }
  };

  const isFiltered = query.trim().length > 0 || filter !== "all" || type !== "all" || sort !== "latest";
  const resetFilters = () => {
    setQuery("");
    setType("all");
    setFilter("all");
    setSort("latest");
  };

  // Thai/English-aware fuzzy search from the design system
  const search = useMemo(
    () => createSearcher(courses.map((c) => ({ label: c.title, description: c.description ?? "", keywords: [c.instructor_name], course: c }))),
    [courses],
  );

  const shown = useMemo(() => {
    let list = query.trim() ? search(query).hits.map((h) => h.item.course) : courses;
    if (filter !== "all") list = list.filter((c) => (filter === "verified" ? c.is_verified_course : !c.is_verified_course));
    if (type !== "all") list = list.filter((c) => asCourseType(c.course_type) === type);
    if (sort === "popular") list = [...list].sort((a, b) => b.learner_count - a.learner_count);
    if (sort === "short") list = [...list].sort((a, b) => a.total_duration_sec - b.total_duration_sec);
    if (sort === "long") list = [...list].sort((a, b) => b.total_duration_sec - a.total_duration_sec);
    return list;
  }, [courses, query, filter, type, sort, search]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup
          prefix={query.trim() ? <BrandSignal state="searching" className="size-4" /> : <Search className="h-4 w-4" />}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim()) pulse({ state: "searching" });
          }}
          placeholder="ค้นหาชื่อหลักสูตร ผู้สอน หรือหัวข้อ…"
          aria-label="ค้นหาหลักสูตร"
          className="w-full sm:w-72"
        />

        <div className="overflow-x-auto pb-1 sm:pb-0">
          <SegmentedControl
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            options={[
              { value: "all", label: "ทั้งหมด" },
              { value: "verified", label: "Verified" },
              { value: "community", label: "Community" },
            ]}
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="w-48 sm:w-56">
            <Select value={type} onValueChange={(v) => setType(v as TypeFilter)} aria-label="ประเภทหลักสูตร">
              <option value="all">ทุกประเภท</option>
              {COURSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COURSE_TYPE_INFO[t].label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40 sm:w-44">
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)} aria-label="เรียงลำดับ">
              <option value="latest">ล่าสุด</option>
              <option value="popular">ผู้เรียนมากที่สุด</option>
              <option value="short">ใช้เวลาน้อยที่สุด</option>
              <option value="long">ใช้เวลามากที่สุด</option>
            </Select>
          </div>

          <div className="hidden sm:flex items-center rounded-lg border bg-muted/20 p-0.5">
            <button
              type="button"
              onClick={() => switchView("grid")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "grid" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="มุมมองตาราง (Grid View)"
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => switchView("list")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "list" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="มุมมองรายการ (List View)"
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          พบ <strong className="text-foreground font-semibold tabular-nums">{shown.length}</strong> หลักสูตร
          {isFiltered && ` (จากทั้งหมด ${courses.length} หลักสูตร)`}
        </span>
        {isFiltered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> ล้างตัวกรอง
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-5 w-5" />}
          title="ไม่พบหลักสูตรที่ตรงกับการค้นหา"
          description="ลองใช้คำค้นอื่น หรือเปลี่ยนตัวกรอง"
          action={
            <Button variant="outline" size="sm" onClick={resetFilters}>
              <RotateCcw className="h-3.5 w-3.5" /> ล้างตัวกรองทั้งหมด
            </Button>
          }
        />
      ) : viewMode === "list" ? (
        <div className="grid gap-3">
          {shown.map((c, i) => (
            <CourseCard key={c.id} course={c} index={i} layout="list" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((c, i) => (
            <CourseCard key={c.id} course={c} index={i} layout="grid" />
          ))}
        </div>
      )}
    </div>
  );
}
