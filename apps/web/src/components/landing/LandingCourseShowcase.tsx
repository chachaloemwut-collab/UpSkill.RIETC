"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Award, BadgeCheck, BookOpen, Clock, Eye, ShieldCheck, Users } from "lucide-react";
import { Button, Sheet, buttonClass } from "@/components/ui";
import { CourseCard, type CourseCardData } from "@/components/course/CourseCard";
import { formatDuration } from "@/lib/format";

export function LandingCourseShowcase({ courses }: { courses: CourseCardData[] }) {
  const [selectedCourse, setSelectedCourse] = React.useState<CourseCardData | null>(null);

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((c, i) => (
          <div key={c.slug} className="group relative flex flex-col">
            <CourseCard
              course={c}
              index={i}
              footer={
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-medium gap-1.5 border-dashed hover:border-solid"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedCourse(c);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" /> ดูรายละเอียดด่วน
                  </Button>
                </div>
              }
            />
          </div>
        ))}
      </div>

      <Sheet
        open={!!selectedCourse}
        onOpenChange={(open) => !open && setSelectedCourse(null)}
        side="right"
        title="ตัวอย่างข้อมูลหลักสูตร"
      >
        {selectedCourse && (
          <div className="grid gap-6 py-2">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {selectedCourse.is_verified_course ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verified Course
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    Community Course
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold tracking-tight">{selectedCourse.title}</h3>
              {selectedCourse.instructor_name && (
                <p className="mt-1 text-sm text-muted-foreground">ผู้สอน: {selectedCourse.instructor_name}</p>
              )}
            </div>

            {selectedCourse.description && (
              <div className="grid gap-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">คำอธิบาย</p>
                <p className="text-sm leading-relaxed text-foreground/80">{selectedCourse.description}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center">
              <div>
                <BookOpen className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">บทเรียน</p>
                <p className="text-sm font-semibold">{selectedCourse.lesson_count} บท</p>
              </div>
              <div>
                <Clock className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">ความยาว</p>
                <p className="text-sm font-semibold">{formatDuration(selectedCourse.total_duration_sec)}</p>
              </div>
              <div>
                <Users className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">ผู้เรียน</p>
                <p className="text-sm font-semibold">{selectedCourse.learner_count ?? 0} คน</p>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">เกณฑ์การสำเร็จการศึกษา</p>
              <ul className="grid gap-2 text-xs text-foreground/80">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <span>บันทึกเวลาเรียนจริงผ่านเกณฑ์ขั้นต่ำ 80% ของแต่ละบท</span>
                </li>
                <li className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary shrink-0" />
                  <span>ทำแบบทดสอบท้ายหลักสูตรผ่านเกณฑ์ 70% ขึ้นไป</span>
                </li>
                <li className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-primary shrink-0" />
                  <span>รับใบรับรองดิจิทัลพร้อมรหัสตรวจสอบสาธารณะทันที</span>
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <Link
                href={`/courses/${selectedCourse.slug}`}
                className={buttonClass("default", "lg", "w-full justify-center gap-2 shadow-sm")}
                onClick={() => setSelectedCourse(null)}
              >
                ดูรายละเอียดเต็มและเริ่มเรียน <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
