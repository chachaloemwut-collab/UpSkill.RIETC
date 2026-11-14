// One-off cleanup: remove accumulated completed jobs (and their repeat hashes) from BullMQ queues.
import { Queue } from "bullmq";
import { Redis } from "ioredis";

const connection = new Redis("redis://:dev_redis_password@127.0.0.1:6379/0", {
  maxRetriesPerRequest: null,
});

const queues = [
  "email-outbox",
  "assignment-reminders",
  "weekly-summary",
  "video-recheck",
  "cohort-notifications",
  "certificate-pdf",
];

for (const name of queues) {
  const q = new Queue(name, { connection });
  const before = await q.getJobCounts("completed");
  const removed = await q.clean(0, 1_000_000, "completed");
  const after = await q.getJobCounts("completed");
  console.log(
    `${name}: completed before=${before.completed} removed=${removed.length} after=${after.completed}`,
  );
  await q.close();
}

await connection.quit();
