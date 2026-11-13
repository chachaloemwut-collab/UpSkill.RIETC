// Re-check video status with the YouTube Data API (the source of truth, not client reports)
import { sql, type Database } from "@upskill/db";
import type { Env } from "@upskill/infra/env";
import { logger } from "@upskill/infra/logger";
import type { EmailJob } from "@upskill/infra/mailer";
import { fetchVideos } from "@upskill/infra/youtube-client";

export async function recheckVideos(
  db: Database,
  env: Env,
  target: { lessonId: string } | { stale: true },
  sendEmail: (job: EmailJob) => Promise<unknown>,
) {
  if (!env.YOUTUBE_API_KEY) {
    logger.warn("YOUTUBE_API_KEY not set: skipping video recheck");
    return;
  }
  const lessons = await db
    .selectFrom("lessons as l")
    .innerJoin("courses as c", "c.id", "l.course_id")
    .innerJoin("users as u", "u.id", "c.instructor_id")
    .select(["l.id", "l.title", "l.youtube_video_id", "l.video_status", "c.id as course_id", "c.title as course_title", "u.email as instructor_email"])
    .$if("lessonId" in target, (q) => q.where("l.id", "=", (target as { lessonId: string }).lessonId))
    .$if("stale" in target, (q) => q.where("l.video_checked_at", "<", sql<Date>`now() - interval '20 hours'`).limit(2500))
    .execute();

  for (let i = 0; i < lessons.length; i += 50) {
    const batch = lessons.slice(i, i + 50);
    // Throws on API errors (quota, network) -> job retries; never marks videos broken on our own failure
    const results = await fetchVideos(env.YOUTUBE_API_KEY, [...new Set(batch.map((l) => l.youtube_video_id))]);

    for (const l of batch) {
      const r = results.get(l.youtube_video_id);
      const next = r?.ok ? "active" : "broken";
      await db.updateTable("lessons").set({ video_status: next, video_checked_at: new Date() }).where("id", "=", l.id).execute();
      if (next === "active") {
        await db.updateTable("video_reports").set({ resolved_at: new Date() }).where("lesson_id", "=", l.id).where("resolved_at", "is", null).execute();
      }
      if (next !== l.video_status) {
        logger.warn({ lessonId: l.id, courseId: l.course_id, status: next, reason: r && !r.ok ? r.reason : undefined }, "video status changed");
        if (next === "broken") {
          // Spec 3.2 #2: notify the instructor to fix the link
          await sendEmail({
            template: "video-broken",
            to: l.instructor_email,
            courseTitle: l.course_title,
            lessonTitle: l.title,
            manageLink: `${env.APP_ORIGIN}/instructor/courses/${l.course_id}`,
          });
        }
      }
    }
  }
}
