// Background worker: runs as its own container (Playwright/Chromium is heavy and must not share the web process)
import { Queue, Worker } from "bullmq";
import { createDb } from "@upskill/db";
import { getEnv } from "@upskill/infra/env";
import { logger } from "@upskill/infra/logger";
import { createRedis } from "@upskill/infra/redis";
import { renderCertificatePdf } from "./jobs/render-certificate-pdf.ts";
import { scheduleCertificateRerender } from "./jobs/rerender-certificates.ts";
import { recheckVideos } from "./jobs/recheck-videos.ts";
import {
  addWorkerEmail,
  enqueueAdminAlert,
  enqueueAssignmentReminders,
  enqueueWeeklySummaries,
  processEmailOutbox,
} from "./jobs/process-email-outbox.ts";
import { enqueueCohortOpenEmails, enqueueCohortStartingEmails } from "./jobs/cohort-notifications.ts";
import { checkAnticheatAnomaly } from "./jobs/anticheat-anomaly.ts";
import { processScheduledBroadcasts } from "./jobs/process-scheduled-broadcasts.ts";
import { expireWaitlistOffers } from "./jobs/expire-waitlist-offers.ts";
import { ensureSystemOwner } from "./system-owner.ts";
import { ensureDeveloperTestCertificate } from "./developer-test.ts";
import { configuredEmailSender } from "./email-transport.ts";

const env = getEnv();
const db = createDb(env.DATABASE_URL);
// BullMQ requires maxRetriesPerRequest = null on its connection
const connection = createRedis(env.REDIS_URL, { maxRetriesPerRequest: null });
await ensureSystemOwner(db, env);
await ensureDeveloperTestCertificate(db, env);
const getEmailSender = configuredEmailSender(db, env);
// Scheduler (repeat) jobs must be removed once completed; otherwise BullMQ retains
// every iteration forever (e.g. outbox-poll fires every second → ~86k jobs/day).
const schedulerQueueOptions = { connection, defaultJobOptions: { removeOnComplete: true } };
const schedulerQueues = [
  new Queue("email-outbox", schedulerQueueOptions),         // [0]
  new Queue("assignment-reminders", schedulerQueueOptions), // [1]
  new Queue("weekly-summary", schedulerQueueOptions),       // [2]
  new Queue("video-recheck", schedulerQueueOptions),        // [3]
  new Queue("cohort-notifications", schedulerQueueOptions), // [4]
  new Queue("ops-health", schedulerQueueOptions),           // [5]
  new Queue("scheduled-broadcasts", schedulerQueueOptions), // [6]
  new Queue("waitlist-expire", schedulerQueueOptions),      // [7]
];

const workers = [
  new Worker(
    "certificate-pdf",
    async (job) => {
      const code = job.data.code as string;
      const rerender = job.data.rerender === true;
      try {
        await renderCertificatePdf(db, env, code, { notify: !rerender });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "certificate render failed";
        // An artwork re-render that fails keeps serving the previous PDF: do not flag the document as failed
        if (rerender) {
          logger.warn({ code, message }, "certificate re-render failed; previous PDF kept");
          throw error;
        }
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
  new Worker("cohort-notifications", async () => {
    await enqueueCohortStartingEmails(db, env.APP_ORIGIN);
    await enqueueCohortOpenEmails(db, env.APP_ORIGIN);
  }, { connection, concurrency: 1 }),
  new Worker("ops-health", () => checkAnticheatAnomaly(db, env.APP_ORIGIN), { connection, concurrency: 1 }),
  new Worker("scheduled-broadcasts", () => processScheduledBroadcasts(db, env.APP_ORIGIN), { connection, concurrency: 1 }),
  new Worker("waitlist-expire", () => expireWaitlistOffers(db), { connection, concurrency: 1 }),
];

// Daily cron: re-check every lesson's video (catches broken videos before learners hit them)
await schedulerQueues[3]!.upsertJobScheduler("daily-stale", { pattern: "0 3 * * *", tz: "Asia/Bangkok" }, { name: "stale" });
await schedulerQueues[0]!.upsertJobScheduler("outbox-poll", { every: 1_000 }, { name: "poll" });
await schedulerQueues[1]!.upsertJobScheduler("due-reminders", { pattern: "0 * * * *", tz: "Asia/Bangkok" }, { name: "due" });
await schedulerQueues[2]!.upsertJobScheduler("weekly", { pattern: "0 8 * * 1", tz: "Asia/Bangkok" }, { name: "weekly" });
await schedulerQueues[4]!.upsertJobScheduler("cohort-starting", { pattern: "*/15 * * * *", tz: "Asia/Bangkok" }, { name: "starting" });
await schedulerQueues[5]!.upsertJobScheduler("anticheat-anomaly", { pattern: "*/15 * * * *", tz: "Asia/Bangkok" }, { name: "check" });
await schedulerQueues[6]!.upsertJobScheduler("scheduled-broadcasts", { every: 60_000 }, { name: "check" });
await schedulerQueues[7]!.upsertJobScheduler("waitlist-expire", { every: 300_000 }, { name: "expire" }); // every 5 min

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

// Issued documents get the current certificate artwork once per artwork version (PDF only, no emails)
const certificatePdfQueue = new Queue("certificate-pdf", { connection });
await scheduleCertificateRerender(db, certificatePdfQueue).catch((err: unknown) =>
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "could not schedule certificate re-render"),
);
await certificatePdfQueue.close();
logger.info("worker started");
