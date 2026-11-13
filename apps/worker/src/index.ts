// Background worker: runs as its own container (Playwright/Chromium is heavy and must not share the web process)
import { Queue, Worker } from "bullmq";
import { createDb } from "@upskill/db";
import { getEnv } from "@upskill/infra/env";
import { logger } from "@upskill/infra/logger";
import { createMailer, type EmailJob } from "@upskill/infra/mailer";
import { createRedis } from "@upskill/infra/redis";
import { renderCertificatePdf } from "./jobs/render-certificate-pdf.ts";
import { recheckVideos } from "./jobs/recheck-videos.ts";

const env = getEnv();
const db = createDb(env.DATABASE_URL);
// BullMQ requires maxRetriesPerRequest = null on its connection
const connection = createRedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const sendMail = createMailer(env.SMTP_URL, env.MAIL_FROM);
const emailQueue = new Queue("email", { connection });
const enqueueEmail = (job: EmailJob) => emailQueue.add(job.template, job, { attempts: 5, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: true });

const workers = [
  new Worker("certificate-pdf", (job) => renderCertificatePdf(db, env, job.data.code as string), { connection, concurrency: 2 }),
  new Worker(
    "video-recheck",
    (job) => recheckVideos(db, env, job.name === "report" ? { lessonId: job.data.lessonId as string } : { stale: true }, enqueueEmail),
    { connection, concurrency: 1 },
  ),
  new Worker("email", (job) => sendMail(job.data as EmailJob), { connection, concurrency: 5 }),
];

// Daily cron: re-check every lesson's video (catches broken videos before learners hit them)
await new Queue("video-recheck", { connection }).upsertJobScheduler("daily-stale", { pattern: "0 3 * * *", tz: "Asia/Bangkok" }, { name: "stale" });

for (const w of workers) {
  // Log only the job id/template: job data can hold email addresses and links with tokens
  w.on("failed", (job, err) => logger.error({ queue: w.name, jobId: job?.id, name: job?.name, err: err.message }, "job failed"));
}

const shutdown = async () => {
  await Promise.all(workers.map((w) => w.close()));
  await emailQueue.close();
  await db.destroy();
  connection.disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
logger.info("worker started");
