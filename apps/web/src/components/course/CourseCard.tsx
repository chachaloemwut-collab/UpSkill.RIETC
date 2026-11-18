import Image from "next/image";
import Link from "next/link";
import { COURSE_TYPE_INFO, asCourseType } from "@upskill/core/application";
import { BadgeCheck, BookOpen, Clock, PlayCircle, Users, Award } from "lucide-react";
import { Avatar, Badge, Progress } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatDuration, youtubeThumb } from "@/lib/format";

export function CourseCover({ videoId, title, className }: { videoId: string | null; title: string; className?: string }) {
  const src = youtubeThumb(videoId);
  return (
    <div className={cn("relative aspect-video overflow-hidden bg-muted", className)}>
      {src ? (
        <Image src={src} alt="" fill sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-700 ease-spring-smooth group-hover:scale-105" />
      ) : (
        <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 via-muted to-muted text-muted-foreground">
          <BookOpen className="h-10 w-10" aria-label={title} />
        </div>
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <PlayCircle aria-hidden className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 scale-75 text-white opacity-0 drop-shadow transition-[opacity,scale] duration-300 group-hover:scale-100 group-hover:opacity-100" />
    </div>
  );
}

export interface CourseCardData {
  slug: string;
  title: string;
  description?: string | null;
  instructor_name?: string;
  lesson_count: number;
  total_duration_sec: number;
  is_verified_course: boolean;
  cover_video_id: string | null;
  learner_count?: number;
  course_type?: string;
}

/** What the course offers (chosen by its owner): ใบรับรอง or ประกาศนียบัตรหลักสูตรระยะสั้น */
function CourseTypeBadge({ type }: { type?: string | undefined }) {
  if (!type) return null;
  const info = COURSE_TYPE_INFO[asCourseType(type)];
  return (
    <Badge title={info.label} className="border-transparent bg-background/95 text-foreground shadow-xs backdrop-blur">
      <Award className="h-3.5 w-3.5 text-primary" /> {info.short}
    </Badge>
  );
}

export function CourseCard({
  course,
  progress,
  href,
  footer,
  index = 0,
  layout = "grid",
}: {
  course: CourseCardData;
  progress?: number;
  href?: string;
  footer?: React.ReactNode;
  index?: number;
  layout?: "grid" | "list";
}) {
  if (layout === "list") {
    return (
      <Link
        href={href ?? `/courses/${course.slug}`}
        className="group flex flex-col sm:flex-row animate-slide-up overflow-hidden rounded-lg border bg-card text-card-foreground transition-[translate,box-shadow] duration-300 [animation-fill-mode:both] hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
      >
        <div className="relative sm:w-64 sm:shrink-0">
          <CourseCover videoId={course.cover_video_id} title={course.title} className="h-full" />
          <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[11px] font-medium text-white backdrop-blur-xs tabular-nums">
            {formatDuration(course.total_duration_sec)}
          </span>
          <div className="absolute left-2.5 top-2.5 flex gap-1.5">
            {course.is_verified_course ? (
              <Badge title="หลักสูตรที่ผ่านการรับรองมาตรฐาน มีระบบบันทึกเวลาเรียนจริงและออกใบรับรอง Ed25519" className="border-transparent bg-background/95 text-foreground shadow-xs backdrop-blur cursor-help">
                <BadgeCheck className="h-3.5 w-3.5 text-success" /> Verified
              </Badge>
            ) : (
              <Badge className="border-transparent bg-background/95 text-muted-foreground shadow-xs backdrop-blur">Community</Badge>
            )}
            <CourseTypeBadge type={course.course_type} />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-between p-4 sm:p-5 gap-2.5">
          <div>
            <h3 className="line-clamp-1 font-semibold text-base sm:text-lg tracking-tight group-hover:text-primary transition-colors">{course.title}</h3>
            {course.description && <p className="line-clamp-2 text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">{course.description}</p>}
          </div>
          {course.instructor_name && (
            <div className="flex items-center gap-2">
              <Avatar name={course.instructor_name} size={22} className="text-[10px]" />
              <span className="text-xs font-medium text-muted-foreground">โดย {course.instructor_name}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-t border-border/50 pt-2.5">
            <span className="inline-flex items-center gap-1 font-medium"><BookOpen className="h-3.5 w-3.5" /> {course.lesson_count} บท</span>
            <span className="inline-flex items-center gap-1 font-medium"><Clock className="h-3.5 w-3.5" /> {formatDuration(course.total_duration_sec)}</span>
            {course.learner_count !== undefined && (
              <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {course.learner_count.toLocaleString("th-TH")} คน</span>
            )}
          </div>
          {footer}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href ?? `/courses/${course.slug}`}
      className="group flex h-full animate-slide-up flex-col overflow-hidden rounded-lg border bg-card text-card-foreground transition-[translate,box-shadow] duration-300 [animation-fill-mode:both] hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className="relative">
        <CourseCover videoId={course.cover_video_id} title={course.title} />
        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[11px] font-medium text-white backdrop-blur-xs tabular-nums">
          {formatDuration(course.total_duration_sec)}
        </span>
        <div className="absolute left-3 top-3 flex gap-1.5">
          {course.is_verified_course ? (
            <Badge title="หลักสูตรที่ผ่านการรับรองมาตรฐาน มีระบบบันทึกเวลาเรียนจริงและออกใบรับรอง Ed25519" className="border-transparent bg-background/95 text-foreground shadow-xs backdrop-blur cursor-help">
              <BadgeCheck className="h-3.5 w-3.5 text-success" /> Verified
            </Badge>
          ) : (
            <Badge className="border-transparent bg-background/95 text-muted-foreground shadow-xs backdrop-blur">Community</Badge>
          )}
          <CourseTypeBadge type={course.course_type} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug tracking-tight group-hover:text-primary transition-colors">{course.title}</h3>
        {course.description && <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">{course.description}</p>}
        {course.instructor_name && (
          <div className="flex items-center gap-2 pt-0.5">
            <Avatar name={course.instructor_name} size={22} className="text-[10px]" />
            <span className="truncate text-xs font-medium text-muted-foreground">โดย {course.instructor_name}</span>
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted-foreground border-t border-border/40">
          <span className="inline-flex items-center gap-1 font-medium">
            <BookOpen className="h-3.5 w-3.5" /> {course.lesson_count} บท
          </span>
          <span className="inline-flex items-center gap-1 font-medium">
            <Clock className="h-3.5 w-3.5" /> {formatDuration(course.total_duration_sec)}
          </span>
          {course.learner_count !== undefined && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {course.learner_count.toLocaleString("th-TH")} คน
            </span>
          )}
        </div>
        {progress !== undefined && (
          <div className="grid gap-1.5 pt-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">ความคืบหน้า</span>
              <span className="font-medium tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}
        {footer}
      </div>
    </Link>
  );
}
