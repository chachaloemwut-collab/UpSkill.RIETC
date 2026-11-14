// Tell approved applicants when their cohort starts. Runs every 15 minutes; the deduplication key makes each
// email go out once even if a run repeats or overlaps.
import { sql, type Database } from "@upskill/db";
import { addWorkerEmail } from "./process-email-outbox.ts";

export async function enqueueCohortStartingEmails(db: Database, appOrigin: string) {
  const rows = await db
    .selectFrom("cohort_registrations as r")
    .innerJoin("program_cohorts as c", "c.id", "r.cohort_id")
    .innerJoin("programs as p", "p.id", "c.program_id")
    .innerJoin("users as u", "u.id", "r.user_id")
    .select(["r.id", "u.id as user_id", "u.email", "c.title as cohort_title", "c.starts_at", "p.title as program_title", "p.slug as program_slug"])
    .where("r.status", "=", "approved")
    .where("c.status", "=", "published")
    .where("u.status", "=", "active")
    // Started within the last day: a worker that was down for a few hours still catches up
    .where("c.starts_at", "<=", sql<Date>`now()`)
    .where("c.starts_at", ">", sql<Date>`now() - interval '24 hours'`)
    .execute();
  for (const r of rows) {
    await addWorkerEmail(
      db,
      {
        template: "cohort-starting",
        to: r.email,
        programTitle: r.program_title,
        cohortTitle: r.cohort_title,
        startsAt: new Date(r.starts_at).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Bangkok" }),
        programLink: `${appOrigin}/programs/${r.program_slug}`,
      },
      { userId: r.user_id, deduplicationKey: `cohort-starting:${r.id}` },
    );
  }
}

// Tell watchers when a cohort's registration window opens. Same cadence as the starting emails.
export async function enqueueCohortOpenEmails(db: Database, appOrigin: string) {
  const rows = await db
    .selectFrom("cohort_watches as w")
    .innerJoin("program_cohorts as c", "c.id", "w.cohort_id")
    .innerJoin("programs as p", "p.id", "c.program_id")
    .innerJoin("users as u", "u.id", "w.user_id")
    .select(["w.id", "u.id as user_id", "u.email", "c.title as cohort_title", "c.registration_opens_at", "p.title as program_title", "p.slug as program_slug"])
    .where("c.status", "=", "published")
    .where("u.status", "=", "active")
    .where("c.registration_opens_at", "<=", sql<Date>`now()`)
    .where("c.registration_opens_at", ">", sql<Date>`now() - interval '24 hours'`)
    .execute();
  for (const r of rows) {
    await addWorkerEmail(
      db,
      {
        template: "cohort-registration-open",
        to: r.email,
        programTitle: r.program_title,
        cohortTitle: r.cohort_title,
        opensAt: new Date(r.registration_opens_at).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Bangkok" }),
        programLink: `${appOrigin}/programs/${r.program_slug}`,
      },
      { userId: r.user_id, deduplicationKey: `cohort-open:${r.id}` },
    );
  }
}
