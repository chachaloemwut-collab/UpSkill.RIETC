/**
 * End-to-end: one learner goes from sign-up to a verified certificate, while every step
 * also checks the attack the spec worries about at that point.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { BASE, Client, SEED_PASSWORD, resetRateLimits, sleep, waitForEmailLink, withDb } from "./helpers.ts";

const run = randomBytes(4).toString("hex");
const learnerEmail = `learner-${run}@e2e.test`;
const learnerPassword = `correct horse battery ${run}`;

const learner = new Client();
const instructor = new Client();
const admin = new Client();

let courseId = "";
let courseSlug = "";
let lessonId = "";
let certCode = "";

beforeAll(async () => {
  await resetRateLimits();
  const home = await fetch(BASE).catch(() => null);
  if (!home) throw new Error(`web app not reachable at ${BASE}`);
  await instructor.login("instructor@upskill.test", SEED_PASSWORD);
  await admin.login("admin@upskill.test", SEED_PASSWORD);
});

describe("security baseline", () => {
  it("sends strict security headers with a nonce-based CSP", async () => {
    const r = await new Client().req("/login");
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-powered-by")).toBeNull();
  });

  it("rejects state-changing requests without a matching Origin (CSRF)", async () => {
    const c = new Client(null);
    expect((await c.req("/api/auth/login", { body: { email: "a@b.co", password: "x" } })).status).toBe(403);
    expect((await c.req("/api/auth/login", { body: { email: "a@b.co", password: "x" }, origin: "https://evil.example" })).json.error).toBe("BAD_ORIGIN");
  });

  it("rejects unknown body fields and oversized payloads", async () => {
    const c = new Client();
    expect((await c.req("/api/auth/login", { body: { email: "a@b.co", password: "x", role: "admin" } })).json.error).toBe("VALIDATION_FAILED");
    expect((await c.req("/api/auth/login", { body: { email: "a@b.co", password: "x".repeat(20_000) } })).status).toBe(413);
  });
});

describe("sign-up and login", () => {
  it("register gives the same answer for new and existing emails (no enumeration)", async () => {
    const a = await new Client().req("/api/auth/register", { body: { email: learnerEmail, password: learnerPassword } });
    const b = await new Client().req("/api/auth/register", { body: { email: "admin@upskill.test", password: learnerPassword } });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.json.message).toBe(b.json.message);
  });

  it("rejects weak passwords", async () => {
    const r = await new Client().req("/api/auth/register", { body: { email: `weak-${run}@e2e.test`, password: "short" } });
    expect(r.json.error).toBe("WEAK_PASSWORD");
  });

  it("blocks login until the email is verified", async () => {
    const r = await learner.req("/api/auth/login", { body: { email: learnerEmail, password: learnerPassword } });
    expect(r.json.error).toBe("EMAIL_NOT_VERIFIED");
  });

  it("verifies the email via the emailed link (POST, single use)", async () => {
    const link = await waitForEmailLink(learnerEmail, "/verify-email");
    const token = new URL(link).searchParams.get("token")!;
    expect((await learner.req("/api/auth/verify-email", { body: { token } })).status).toBe(200);
    expect((await learner.req("/api/auth/verify-email", { body: { token } })).json.error).toBe("INVALID_OR_EXPIRED_TOKEN");
  });

  it("logs in and sets an HttpOnly, SameSite=Lax session cookie", async () => {
    await learner.login(learnerEmail, learnerPassword);
    const cookie = learner.lastSetCookie.find((c) => /^(__Host-)?sid=/.test(c)) ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect((await learner.req("/api/user/me")).json.email).toBe(learnerEmail);
  });

  it("wrong password and unknown email return the same error", async () => {
    const a = await new Client().req("/api/auth/login", { body: { email: learnerEmail, password: "wrong password here" } });
    const b = await new Client().req("/api/auth/login", { body: { email: `nobody-${run}@e2e.test`, password: "wrong password here" } });
    expect(a.json.error).toBe("INVALID_CREDENTIALS");
    expect(b.json.error).toBe("INVALID_CREDENTIALS");
  });

  it("rate-limits brute force on one account", async () => {
    const email = `target-${run}@e2e.test`;
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await new Client().req("/api/auth/login", { body: { email, password: `guess-${i}-xxxxxxxx` } })).status);
    expect(statuses).toContain(429);
  });
});

describe("authorization", () => {
  it("members cannot call instructor or admin APIs", async () => {
    expect((await learner.req("/api/instructor/courses", { body: { title: "Nope" } })).status).toBe(403);
    expect((await learner.req("/api/admin/users", { method: "PATCH", body: { email: learnerEmail, role: "admin" } })).status).toBe(403);
  });

  it("an instructor cannot edit another instructor's course (IDOR -> 404)", async () => {
    const other = await admin.req("/api/instructor/courses", { body: { title: `Admin course ${run}` } });
    expect(other.status).toBe(200);
    const r = await instructor.req(`/api/instructor/courses/${other.json.id}`, { method: "PATCH", body: { title: "hijacked" } });
    expect(r.status).toBe(404);
  });
});

describe("instructor builds and publishes a course", () => {
  it("creates a course and adds a YouTube lesson", async () => {
    const c = await instructor.req("/api/instructor/courses", { body: { title: `E2E course ${run}`, description: "test" } });
    expect(c.status).toBe(200);
    courseId = c.json.id;
    courseSlug = c.json.slug;
    const bad = await instructor.req(`/api/instructor/courses/${courseId}/lessons`, { body: { url: "https://youtube.com.evil.tld/watch?v=aqz-KE-bpKQ", dev_duration_sec: 620 } });
    expect(bad.json.error).toBe("INVALID_YOUTUBE_URL");
    const l = await instructor.req(`/api/instructor/courses/${courseId}/lessons`, { body: { url: "https://youtu.be/aqz-KE-bpKQ", title: "Lesson 1", dev_duration_sec: 620 } });
    expect(l.status).toBe(200);
    lessonId = l.json.id;
  });

  it("refuses to publish without 3 quiz questions (anti-farming)", async () => {
    const r = await instructor.req(`/api/instructor/courses/${courseId}/publish`, { method: "PATCH", body: { visibility: "published" } });
    expect(r.json.error).toBe("PUBLISH_REQUIREMENTS_NOT_MET");
  });

  it("adds questions and publishes", async () => {
    for (let i = 0; i < 3; i++) {
      const q = await instructor.req(`/api/instructor/courses/${courseId}/quiz`, { body: { question_text: `Question ${i}?`, options: ["right", "wrong 1", "wrong 2"], correct_index: 0 } });
      expect(q.status).toBe(200);
    }
    expect((await instructor.req(`/api/instructor/courses/${courseId}/publish`, { method: "PATCH", body: { visibility: "published" } })).status).toBe(200);
  });

  it("instructors cannot enroll in their own course", async () => {
    expect((await instructor.req(`/api/courses/${courseId}/enroll`, { method: "POST" })).json.error).toBe("CANNOT_ENROLL_OWN_COURSE");
  });
});

describe("learning with the anti-cheat heartbeat", () => {
  let token = "";
  let seq = 0;
  const hb = (pos: number, t = token) => learner.req(`/api/learning/lessons/${lessonId}/heartbeat`, { body: { stream_token: t, seq: ++seq, current_second: pos } });

  it("enrolls and starts a learning session", async () => {
    expect((await learner.req(`/api/courses/${courseId}/enroll`, { method: "POST" })).status).toBe(200);
    const s = await learner.req(`/api/learning/lessons/${lessonId}/start-session`, { method: "POST" });
    expect(s.status).toBe(200);
    token = s.json.streamToken;
  });

  it("credits honest 1x playback", async () => {
    expect((await hb(0)).json.status).toBe("resync"); // first ping anchors the segment
    await sleep(3_000);
    const r = await hb(3);
    expect(r.json.status).toBe("credited");
    expect(r.json.maxWatchedSec).toBe(3);
  });

  it("flags a seek past the frontier and does not move it", async () => {
    await sleep(2_100);
    const r = await hb(300);
    expect(r.json.warning).toBe("POSITION_JUMP");
    expect(r.json.maxWatchedSec).toBe(3);
    const flags = await withDb((db) => db.query("select count(*)::int n from anticheat_events a join users u on u.id = a.user_id where u.email = $1", [learnerEmail]));
    expect(flags.rows[0].n).toBeGreaterThan(0);
  });

  it("ignores replayed sequence numbers", async () => {
    await sleep(2_100);
    const r = await learner.req(`/api/learning/lessons/${lessonId}/heartbeat`, { body: { stream_token: token, seq: 1, current_second: 5 } });
    expect(r.json.status).toBe("ignored");
  });

  it("a second tab supersedes the first (409 SESSION_SUPERSEDED)", async () => {
    const s2 = await learner.req(`/api/learning/lessons/${lessonId}/start-session`, { method: "POST" });
    await sleep(2_100);
    const old = await hb(6, token);
    expect(old.status).toBe(409);
    expect(old.json.error).toBe("SESSION_SUPERSEDED");
    token = s2.json.streamToken;
    seq = 0;
  });

  it("rejects a forged stream token", async () => {
    const r = await hb(6, "x".repeat(43));
    expect(r.status).toBe(401);
  });
});

describe("quiz", () => {
  it("cannot start before every lesson is completed", async () => {
    expect((await learner.req(`/api/courses/${courseId}/quiz/start`, { method: "POST" })).json.error).toBe("LESSONS_NOT_COMPLETED");
  });

  it("(test helper) fast-forwards the lesson to completed", async () => {
    // Watching 620s in real time is covered by core unit tests; here we only need the end state
    await withDb((db) =>
      db.query(
        `update lesson_progress p set is_completed = true, completed_at = now(), accumulated_valid_sec = 600,
           watched_chunks = (select array_agg(g) from generate_series(0, 61) g), max_watched_sec = 620
         from enrollments e join users u on u.id = e.user_id
         where p.enrollment_id = e.id and u.email = $1 and e.course_id = $2`,
        [learnerEmail, courseId],
      ),
    );
  });

  it("never sends the answer key and remaps option ids", async () => {
    const r = await learner.req(`/api/courses/${courseId}/quiz/start`, { method: "POST" });
    expect(r.status).toBe(200);
    expect(r.text).not.toMatch(/correct/i);
    for (const q of r.json.questions) for (const o of q.options) expect(["a", "b", "c"]).not.toContain(o.id);
  });

  it("fails with wrong answers, then passes with right ones", async () => {
    const start = await learner.req(`/api/courses/${courseId}/quiz/start`, { method: "POST" }); // resumes the open attempt
    const attemptId = start.json.attemptId;
    const wrong = Object.fromEntries(start.json.questions.map((q: any) => [q.questionId, "deadbeef"]));
    const fail = await learner.req(`/api/courses/${courseId}/quiz/submit`, { body: { attempt_id: attemptId, answers: wrong } });
    expect(fail.json.passed).toBe(false);

    const again = await learner.req(`/api/courses/${courseId}/quiz/start`, { method: "POST" });
    const snapshot = await withDb((db) => db.query("select questions_snapshot from quiz_attempts where id = $1", [again.json.attemptId]));
    const right = Object.fromEntries(snapshot.rows[0].questions_snapshot.map((s: any) => [s.questionId, s.correctOptionId]));
    const pass = await learner.req(`/api/courses/${courseId}/quiz/submit`, { body: { attempt_id: again.json.attemptId, answers: right } });
    expect(pass.json.passed).toBe(true);
    expect(pass.json.scorePercentage).toBe(100);
  });
});

describe("certificate", () => {
  it("requires a locked legal name before issuing", async () => {
    expect((await learner.req(`/api/courses/${courseId}/certificate/issue`, { body: { locale: "th" } })).json.error).toBe("LEGAL_NAME_NOT_LOCKED");
    expect((await learner.req("/api/user/lock-legal-name", { body: { legal_full_name_th: "ทดสอบ ระบบ", confirm: true } })).status).toBe(200);
    expect((await learner.req("/api/user/lock-legal-name", { body: { legal_full_name_th: "ชื่อ ใหม่", confirm: true } })).json.error).toBe("LEGAL_NAME_ALREADY_LOCKED");
  });

  it("issues once (idempotent)", async () => {
    const a = await learner.req(`/api/courses/${courseId}/certificate/issue`, { body: { locale: "th" } });
    const b = await learner.req(`/api/courses/${courseId}/certificate/issue`, { body: { locale: "th" } });
    expect(a.json.created).toBe(true);
    expect(b.json.created).toBe(false);
    expect(b.json.code).toBe(a.json.code);
    certCode = a.json.code;
    expect(certCode).toMatch(/^CERT-\d{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  it("public verification works without login and exposes no internal ids", async () => {
    const r = await new Client().req(`/api/public/verify/${certCode}`);
    expect(r.json.status).toBe("valid");
    expect(r.json.recipientName).toBe("ทดสอบ ระบบ");
    expect(r.text).not.toMatch(/userId|enrollmentId|@e2e\.test/);
  });

  it("detects a certificate edited directly in the database", async () => {
    // Even the owner role must disable the immutability trigger to do this
    const tamper = (value: number) =>
      withDb(async (db) => {
        await db.query("alter table certificates disable trigger trg_certificates_immutable");
        await db.query("update certificates set total_actual_study_sec = $1 where certificate_code = $2", [value, certCode]);
        await db.query("alter table certificates enable trigger trg_certificates_immutable");
      });
    const original = (await new Client().req(`/api/public/verify/${certCode}`)).json.totalStudySec;
    await tamper(99_999);
    expect((await new Client().req(`/api/public/verify/${certCode}`)).json.status).toBe("tampered");
    await tamper(original);
    expect((await new Client().req(`/api/public/verify/${certCode}`)).json.status).toBe("valid");
  });

  it("publishes the verification public key", async () => {
    const r = await new Client().req("/.well-known/certificate-keys.json");
    expect(r.json.keys[0]).toMatchObject({ alg: "EdDSA", crv: "Ed25519" });
  });

  it("only the owner can download the PDF (rendered by the worker)", async () => {
    expect((await instructor.req(`/api/certificates/${certCode}/download`)).status).toBe(404);
    let r = await learner.req(`/api/certificates/${certCode}/download`);
    for (let i = 0; i < 30 && r.status === 202; i++) {
      await sleep(2_000);
      r = await learner.req(`/api/certificates/${certCode}/download`);
    }
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.text.startsWith("%PDF")).toBe(true);
  });

  it("admin revocation shows on the public page", async () => {
    expect((await admin.req(`/api/admin/certificates/${certCode}/revoke`, { body: { reason: "E2E revocation test" } })).status).toBe(200);
    const r = await new Client().req(`/api/public/verify/${certCode}`);
    expect(r.json.status).toBe("revoked");
    expect(r.json.revokedReason).toBe("E2E revocation test");
  });
});

describe("password reset", () => {
  it("resets via the emailed link and logs out every device", async () => {
    expect((await new Client().req("/api/auth/forgot-password", { body: { email: learnerEmail } })).status).toBe(200);
    const link = await waitForEmailLink(learnerEmail, "/reset-password");
    const token = new URL(link).searchParams.get("token")!;
    const newPassword = `brand new passphrase ${run}`;
    expect((await new Client().req("/api/auth/reset-password", { body: { token, new_password: newPassword } })).status).toBe(200);
    // The existing session was revoked
    expect((await learner.req("/api/user/me")).json.id).toBeNull();
    // Token is single use
    expect((await new Client().req("/api/auth/reset-password", { body: { token, new_password: newPassword } })).json.error).toBe("INVALID_OR_EXPIRED_TOKEN");
    await new Client().login(learnerEmail, newPassword);
  });
});
