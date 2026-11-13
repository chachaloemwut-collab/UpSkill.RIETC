import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, BookOpen, Clock, PlayCircle, Users } from "lucide-react";
import { Badge, Progress } from "@/components/ui";
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
}

export function CourseCard({ course, progress, href, footer, index = 0 }: { course: CourseCardData; progress?: number; href?: string; footer?: React.ReactNode; index?: number }) {
  return (
    <Link
      href={href ?? `/courses/${course.slug}`}
      className="group flex h-full animate-slide-up flex-col overflow-hidden rounded-lg border bg-card text-card-foreground transition-[translate,box-shadow] duration-300 [animation-fill-mode:both] hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className="relative">
        <CourseCover videoId={course.cover_video_id} title={course.title} />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {course.is_verified_course ? (
            <Badge className="border-transparent bg-background/90 text-foreground shadow-xs backdrop-blur">
              <BadgeCheck className="h-3.5 w-3.5 text-success" /> Verified
            </Badge>
          ) : (
            <Badge className="border-transparent bg-background/90 text-muted-foreground shadow-xs backdrop-blur">Community</Badge>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug tracking-tight">{course.title}</h3>
        {course.description && <p className="line-clamp-2 text-sm text-muted-foreground">{course.description}</p>}
        {course.instructor_name && <p className="text-xs text-muted-foreground">โดย {course.instructor_name}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" /> {course.lesson_count} บท
          </span>
          <span className="inline-flex items-center gap-1">
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
