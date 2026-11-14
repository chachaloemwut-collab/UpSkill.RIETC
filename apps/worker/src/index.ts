// Background worker: runs as its own container (Playwright/Chromium is heavy and must not share the web process)
import { Queue, Worker } from "bullmq";
import { createDb } from "@upskill/db";
import { getEnv } from "@upskill/infra/env";
import { logger } from "@upskill/infra/logger";
import { createRedis } from "@upskill/infra/redis";
import { renderCertificatePdf } from "./jobs/render-certificate-pdf.ts";
import { recheckVideos } from "./jobs/recheck-videos.ts";
import {
  addWorkerEmail,
  enqueueAdminAlert,
  enqueueAssignmentReminders,
  enqueueWeeklySummaries,
  processEmailOutbox,
} from "./jobs/process-email-outbox.ts";
import { enqueueCohortStartingEmails } from "./jobs/cohort-notifications.ts";
import { checkAnticheatAnomaly } from "./jobs/anticheat-anomaly.ts";
import { ensureSystemOwner } from "./system-owner.ts";
import { configuredEmailSender } from "./email-transport.ts";

const env = getEnv();
const db = createDb(env.DATABASE_URL);
// BullMQ requires maxRetriesPerRequest = null on its connection
const connection = createRedis(env.REDIS_URL, { maxRetriesPerRequest: null });
await ensureSystemOwner(db, env);
const getEmailSender = configuredEmailSender(db, env);
// Scheduler (repeat) jobs must be removed once completed; otherwise BullMQ retains
// every iteration forever (e.g. outbox-poll fires every second → ~86k jobs/day).
const schedulerQueueOptions = { connection, defaultJobOptions: { removeOnComplete: true } };
const schedulerQueues = [
  new Queue("email-outbox", schedulerQueueOptions),
  new Queue("assignment-reminders", schedulerQueueOptions),
  new Queue("weekly-summary", schedulerQueueOptions),
  new Queue("video-recheck", schedulerQueueOptions),
  new Queue("cohort-notifications", schedulerQueueOptions),
  new Queue("ops-health", schedulerQueueOptions),
];

const workers = [
  new Worker(
    "certificate-pdf",
    async (job) => {
      const code = job.data.code as string;
      try {
        await renderCertificatePdf(db, env, code);
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "certificate render failed";
        await db.updateTable("certificates").set({ pdf_failed_at: new Date(), pdf_last_error: message }).where("certificate_code", "=", code).execute();
        if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
          await enqueueAdminAlert(db, "สร้างไฟล์เอกสารไม่สำเร็จ", `รหัส ${code}: ${message}`, `pdf-failed:${code}`, env.APP_ORIGIN);
        }
        throw error;
      }
    },
    { connection, concurrency: 2 },
  ),
  new Worker(
    "video-recheck",
    (job) =>
      recheckVideos(db, env, job.name === "report" ? { lessonId: job.data.lessonId as string } : { stale: true }, (email) =>
        addWorkerEmail(db, email, {
          deduplicationKey: `video-broken:${email.to}:${"lessonTitle" in email ? email.lessonTitle : job.id ?? "unknown"}`,
        }),
      ),
    { connection, concurrency: 1 },
  ),
  new Worker("email-outbox", () => processEmailOutbox(db, getEmailSender, env.APP_ORIGIN), { connection, concurrency: 1 }),
  new Worker("assignment-reminders", () => enqueueAssignmentReminders(db, env.APP_ORIGIN), { connection, concurrency: 1 }),
  new Worker("weekly-summary", () => enqueueWeeklySummaries(db, env.APP_ORIGIN), { connection, concurrency: 1 }),
  new Worker("cohort-notifications", () => enqueueCohortStartingEmails(db, env.APP_ORIGIN), { connection, concurrency: 1 }),
  new Worker("ops-health", () => checkAnticheatAnomaly(db, env.APP_ORIGIN), { connection, concurrency: 1 }),
];

// Daily cron: re-check every lesson's video (catches broken videos before learners hit them)
await schedulerQueues[3]!.upsertJobScheduler("daily-stale", { pattern: "0 3 * * *", tz: "Asia/Bangkok" }, { name: "stale" });
await schedulerQueues[0]!.upsertJobScheduler("outbox-poll", { every: 1_000 }, { name: "poll" });
await schedulerQueues[1]!.upsertJobScheduler("due-reminders", { pattern: "0 * * * *", tz: "Asia/Bangkok" }, { name: "due" });
await schedulerQueues[2]!.upsertJobScheduler("weekly", { pattern: "0 8 * * 1", tz: "Asia/Bangkok" }, { name: "weekly" });
await schedulerQueues[4]!.upsertJobScheduler("cohort-starting", { pattern: "*/15 * * * *", tz: "Asia/Bangkok" }, { name: "starting" });
await schedulerQueues[5]!.upsertJobScheduler("anticheat-anomaly", { pattern: "*/15 * * * *", tz: "Asia/Bangkok" }, { name: "check" });

for (const w of workers) {
  // Log only the job id/template: job data can hold email addresses and links with tokens
  w.on("failed", (job, err) => {
    logger.error({ queue: w.name, jobId: job?.id, name: job?.name, err: err.message }, "job failed");
    // Alert admins on the FINAL attempt (no retries left). `certificate-pdf` already
    // self-alerts with a more specific message, so skip it here to avoid duplicates.
    if (job && w.name !== "certificate-pdf" && job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      void enqueueAdminAlert(
        db,
        "งานเบื้องหลังล้มเหลว",
        `คิว ${w.name} งาน ${job.id} (${job.name}) ล้มเหลว: ${err.message.slice(0, 300)}`,
        `job-failed:${w.name}:${job.id}`,
        env.APP_ORIGIN,
      );
    }
  });
}

const shutdown = async () => {
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(schedulerQueues.map((q) => q.close()));
  await db.destroy();
  connection.disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
logger.info("worker started");
