/**
 * Import "การจัดทำกระทงรักษ์โลกเพื่อการประกวด" (4 units / 10 clips / 10 end-of-clip questions).
 *
 * SAFE BY DEFAULT
 *  - Without --apply it only prints what it would do (dry run).
 *  - Creates the course under its own slug (krathong-contest-2569) as a DRAFT unless --publish.
 *  - Re-running rebuilds that course's content ONLY while it has no enrollments; once anyone has
 *    enrolled it refuses (learner progress is never deleted). Other courses are never touched,
 *    except --archive <slug>, which sets that one course to "archived" (its learners keep their
 *    progress and certificates).
 *  - With YOUTUBE_API_KEY set, every video is verified (exists, embeddable, not live) and its real
 *    duration is used; otherwise the durations from the syllabus are used.
 *
 * Usage (inside the worker container, env from compose):
 *   node --import tsx src/import-krathong-contest.ts                       # dry run
 *   node --import tsx src/import-krathong-contest.ts --apply               # create/update as draft
 *   node --import tsx src/import-krathong-contest.ts --apply --publish --archive krathong-rak-lok
 *   options: --instructor-email <email>  (default: the instructor of --archive course, else the first admin)
 */
import { createDb, sql } from "@upskill/db";
import { getEnv } from "@upskill/infra/env";
import { fetchVideos } from "@upskill/infra/youtube-client";
import { KRATHONG_CONTEST_2569 as C } from "./courses/krathong-contest-2569.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const apply = flag("--apply");
const publish = flag("--publish");
const archiveSlug = option("--archive");
const instructorEmail = option("--instructor-email");

const env = getEnv();
const db = createDb(env.DATABASE_URL);
const log = (msg: string) => console.log(`${apply ? "" : "[dry-run] "}${msg}`);

async function main() {
  const lessons = C.units.flatMap((u, ui) => u.lessons.map((l) => ({ ...l, unitIndex: ui })));
  log(`Course "${C.title}" (${C.slug}): ${C.units.length} units, ${lessons.length} clips, ${lessons.length} end-of-clip questions`);

  // 1. Verify videos (and use the real durations) when the YouTube API is configured
  if (env.YOUTUBE_API_KEY) {
    const results = await fetchVideos(env.YOUTUBE_API_KEY, lessons.map((l) => l.videoId));
    const problems: string[] = [];
    for (const l of lessons) {
      const r = results.get(l.videoId);
      if (!r?.ok) problems.push(`${l.videoId} (${l.title}): ${r?.reason ?? "NOT_FOUND"}`);
      else if (Math.abs(r.durationSec - l.durationSec) > 5) {
        log(`  duration of ${l.videoId}: syllabus ${l.durationSec}s, YouTube ${r.durationSec}s -> using YouTube`);
        l.durationSec = r.durationSec;
      }
    }
    if (problems.length) throw new Error(`Videos not usable:\n  ${problems.join("\n  ")}`);
    log("All 10 videos verified on YouTube");
  } else {
    log("YOUTUBE_API_KEY not set: using durations from the syllabus without verification");
  }
  const totalSec = lessons.reduce((n, l) => n + l.durationSec, 0);
  log(`Total video time ${Math.floor(totalSec / 3600)}h ${Math.floor((totalSec % 3600) / 60)}m ${totalSec % 60}s`);

  // 2. Instructor
  const archived = archiveSlug ? await db.selectFrom("courses").select(["id", "instructor_id", "title", "visibility"]).where("slug", "=", archiveSlug).executeTakeFirst() : undefined;
  if (archiveSlug && !archived) throw new Error(`--archive: course "${archiveSlug}" not found`);
  const instructor = instructorEmail
    ? await db.selectFrom("users").select(["id", "email"]).where(sql`lower(email)`, "=", instructorEmail.toLowerCase()).executeTakeFirst()
    : archived
      ? await db.selectFrom("users").select(["id", "email"]).where("id", "=", archived.instructor_id).executeTakeFirst()
      : await db.selectFrom("users").select(["id", "email"]).where("role", "=", "admin").orderBy("created_at").executeTakeFirst();
  if (!instructor) throw new Error("No instructor found (use --instructor-email)");
  log(`Instructor: ${instructor.email.replace(/^(.).*(@.*)$/, "$1***$2")}`);

  // 3. Existing course with this slug?
  const existing = await db.selectFrom("courses").select(["id", "visibility"]).where("slug", "=", C.slug).executeTakeFirst();
  if (existing) {
    const n = await db.selectFrom("enrollments").select(sql<number>`count(*)::int`.as("n")).where("course_id", "=", existing.id).executeTakeFirstOrThrow();
    if (n.n > 0) {
      throw new Error(`Course ${C.slug} already has ${n.n} enrollment(s): refusing to rebuild its content (learner progress would be lost). Edit it in the instructor UI instead.`);
    }
    log(`Course ${C.slug} exists with no enrollments -> its units, clips and questions will be rebuilt`);
  } else {
    log(`Course ${C.slug} will be created`);
  }
  if (archived) log(`Course ${archiveSlug} ("${archived.title}", ${archived.visibility}) will be set to archived`);
  log(`Visibility after import: ${publish ? "published" : existing?.visibility ?? "draft"}`);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write these changes.");
    return;
  }

  // 4. Write everything in one transaction
  await db.transaction().execute(async (trx) => {
    const values = {
      instructor_id: instructor.id,
      title: C.title,
      description: C.description,
      total_duration_sec: totalSec,
      ...C.settings,
      ...C.credential,
    };
    let courseId: string;
    if (existing) {
      courseId = existing.id;
      await trx.updateTable("courses").set(values).where("id", "=", courseId).execute();
      await trx.deleteFrom("quiz_questions").where("course_id", "=", courseId).execute();
      await trx.deleteFrom("lessons").where("course_id", "=", courseId).execute();
      await trx.deleteFrom("course_units").where("course_id", "=", courseId).execute();
    } else {
      const row = await trx.insertInto("courses").values({ ...values, slug: C.slug, visibility: "draft" }).returning("id").executeTakeFirstOrThrow();
      courseId = row.id;
    }

    let order = 0;
    for (const [ui, unit] of C.units.entries()) {
      const u = await trx
        .insertInto("course_units")
        .values({ course_id: courseId, sequence_order: ui + 1, title: unit.title, summary: unit.summary })
        .returning("id")
        .executeTakeFirstOrThrow();
      for (const l of unit.lessons) {
        order += 1;
        const durationSec = lessons.find((x) => x.videoId === l.videoId && x.title === l.title)!.durationSec;
        const lesson = await trx
          .insertInto("lessons")
          .values({
            course_id: courseId,
            sequence_order: order,
            title: l.title,
            youtube_video_id: l.videoId,
            duration_sec: durationSec,
            video_status: "active",
            is_public: true,
            unit_id: u.id,
            description: `ช่องผู้ผลิต: ${l.channel}`,
            learner_note: l.learnerNote ?? null,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        const options = l.question.options.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));
        await trx
          .insertInto("quiz_questions")
          .values({
            course_id: courseId,
            assessment_type: "lesson",
            lesson_id: lesson.id,
            question_text: l.question.text,
            options: JSON.stringify(options),
            correct_option_id: options[l.question.correctIndex]!.id,
          })
          .execute();
      }
    }

    if (publish) {
      await trx.updateTable("courses").set({ visibility: "published", published_at: sql<Date>`coalesce(published_at, now())` }).where("id", "=", courseId).execute();
    }
    if (archived) {
      await trx.updateTable("courses").set({ visibility: "archived" }).where("id", "=", archived.id).execute();
    }
  });
  console.log(`Done: ${C.slug} imported${publish ? " and published" : " as draft"}${archived ? `; ${archiveSlug} archived` : ""}.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void db.destroy());
