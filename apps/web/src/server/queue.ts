import "server-only";
import { Queue } from "bullmq";
import type { EmailJob } from "@upskill/infra/mailer";
import { ctx } from "./context";

// Heavy or slow work (PDF rendering, YouTube API, SMTP) runs in apps/worker, not in the web request path
const queues = new Map<string, Queue>();
function queue(name: "certificate-pdf" | "video-recheck" | "email"): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: ctx().redis });
    queues.set(name, q);
  }
  return q;
}

export async function enqueueCertificatePdf(code: string) {
  await queue("certificate-pdf").add(
    "render",
    { code },
    { jobId: `pdf-${code}`, attempts: 5, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: true },
  );
}

export async function enqueueVideoRecheck(lessonId: string) {
  // jobId dedupes: many reports for the same lesson within the delay become one job
  await queue("video-recheck").add("report", { lessonId }, { jobId: `vr-${lessonId}`, removeOnComplete: true, delay: 30_000 });
}

export async function enqueueEmail(job: EmailJob) {
  await queue("email").add(job.template, job, {
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });
}
