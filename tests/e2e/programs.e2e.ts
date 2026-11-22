/**
 * End-to-end: an admin builds a training program from courses, opens a cohort with dates, seats and
 * eligibility rules, reviews applicants, and announces it on the public site.
 */
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Client, SEED_PASSWORD, resetRateLimits, withDb } from "./helpers.ts";

const run = randomBytes(4).toString("hex");
const ORG = `org-${run}.test`;
const admin = new Client();
const instructor = new Client();

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Test users are created directly with a session: the sign-up flow itself is covered by flow.e2e.ts */
async function makeUser(name: string, domain = ORG, withProfile = true): Promise<{ client: Client; id: string; email: string }> {
  const email = `${name}-${run}@${domain}`;
  const token = randomBytes(32).toString("base64url");
  const id = await withDb(async (db) => {
    const u = await db.query("insert into users (email, email_verified_at, role, status) values ($1, now(), 'member', 'active') returning id", [email]);
    if (withProfile) {
      // Direct insert: the digest only has to be unique here (sign-up hashing is covered by profile.e2e.ts)
      await db.query(
        `insert into user_profiles (user_id, title_th, first_name_th, last_name_th, title_en, first_name_en, last_name_en, phone, birth_date,
           address_line, subdistrict, district, province, postal_code, national_id_hmac, national_id_encrypted, national_id_last4,
           pdpa_notice_version, pdpa_consented_at)
         values ($1, 'นาย', 'ทดสอบ', 'ระบบ', 'Mr.', 'Test', 'System', '0812345678', '1995-01-01', '1', 'ในเมือง', 'เมือง', 'ร้อยเอ็ด', '45000',
           $2, 'v1.test', '0000', 'test', now())`,
        [u.rows[0].id, randomBytes(32)],
      );
    }
    await db.query(
      "insert into user_sessions (user_id, token_hash, ip_address, user_agent, idle_expires_at, expires_at) values ($1, $2, '127.0.0.1', 'e2e', now() + interval '1 day', now() + interval '1 day')",
      [u.rows[0].id, createHash("sha256").update(token).digest()],
    );
    return u.rows[0].id as string;
  });
  const client = new Client();
  // Same cookie name the server used for the admin login (depends on whether APP_ORIGIN is https)
  client.cookies.set([...admin.cookies.keys()].find((k) => /^(__Host-)?sid$/.test(k)) ?? "sid", token);
  return { client, id, email };
}

const outbox = (template: string, email: string) =>
  withDb((db) => db.query("select count(*)::int as n from email_outbox where template_key = $1 and recipient_email = $2", [template, email.toLowerCase()])).then((r) => r.rows[0].n as number);

let instructorId = "";
let courseId = "";
let lessonId = "";
let programId = "";
let programSlug = "";
let cohortId = "";
let a: Awaited<ReturnType<typeof makeUser>>;
let b: Awaited<ReturnType<typeof makeUser>>;
let c: Awaited<ReturnType<typeof makeUser>>;
let outsider: Awaited<ReturnType<typeof makeUser>>;

const cohortBody = (over: Record<string, unknown> = {}) => ({
  title: `รุ่น ${run}`,
  registrationOpensAt: iso(2 * DAY),
  registrationClosesAt: iso(7 * DAY),
  startsAt: iso(8 * DAY),
  endsAt: iso(30 * DAY),
  capacity: 2,
  waitlistEnabled: true,
  requiresApproval: true,
  eligibility: {
    emailDomains: [ORG],
    groupIds: [],
    requireLegalName: false,
    prerequisiteCourseIds: [],
    applicationForm: [{ key: "org", label: "หน่วยงาน", type: "text", required: true }],
  },
  ...over,
});

beforeAll(async () => {
  await resetRateLimits();
  await admin.login("admin@upskill.test", SEED_PASSWORD);
  await instructor.login("instructor@upskill.test", SEED_PASSWORD);
  instructorId = await withDb((db) => db.query("select id from users where email = 'instructor@upskill.test'")).then((r) => r.rows[0].id);
  [a, b, c, outsider] = await Promise.all([makeUser("a"), makeUser("b"), makeUser("c"), makeUser("x", `other-${run}.test`)]);
});

describe("admins manage every course", () => {
  it("creates a course on behalf of an instructor (audited)", async () => {
    expect((await instructor.req("/api/admin/courses", { body: { title: "Nope", instructor_id: instructorId } })).status).toBe(403);
    const r = await admin.req("/api/admin/courses", { body: { title: `Program course ${run}`, instructor_id: instructorId } });
    expect(r.status).toBe(200);
    courseId = r.json.id;
    const row = await withDb((db) => db.query("select instructor_id from courses where id = $1", [courseId]));
    expect(row.rows[0].instructor_id).toBe(instructorId);
    const audit = await withDb((db) => db.query("select count(*)::int as n from audit_logs where action = 'course.created_for_instructor' and entity_id = $1", [courseId]));
    expect(audit.rows[0].n).toBe(1);
  });

  it("refuses to make a learner the instructor", async () => {
    const r = await admin.req(`/api/admin/courses/${courseId}`, { method: "PATCH", body: { instructor_id: a.id } });
    expect(r.json.error).toBe("INSTRUCTOR_INVALID");
  });

  it("builds the course content and publishes it as unlisted", async () => {
    const l = await admin.req(`/api/instructor/courses/${courseId}/lessons`, { body: { url: "https://youtu.be/aqz-KE-bpKQ", title: "Lesson 1", dev_duration_sec: 620 } });
    expect(l.status).toBe(200);
    lessonId = l.json.id;
    for (let i = 0; i < 3; i++) {
      expect((await admin.req(`/api/instructor/courses/${courseId}/quiz`, { body: { question_text: `Q${i}?`, options: ["right", "wrong"], correct_index: 0 } })).status).toBe(200);
    }
    expect((await admin.req(`/api/instructor/courses/${courseId}/publish`, { method: "PATCH", body: { visibility: "unlisted" } })).status).toBe(200);
  });
});

describe("programs", () => {
  it("is admin-only", async () => {
    expect((await a.client.req("/api/admin/programs", { body: { title: "Nope program" } })).status).toBe(403);
    expect((await instructor.req("/api/admin/programs", { body: { title: "Nope program" } })).status).toBe(403);
  });

  it("refuses to publish an empty program", async () => {
    const p = await admin.req("/api/admin/programs", { body: { title: `โปรแกรม ${run}`, summary: "หลักสูตรอบรมทดสอบอัตโนมัติ" } });
    expect(p.status).toBe(200);
    programId = p.json.id;
    programSlug = p.json.slug;
    const r = await admin.req(`/api/admin/programs/${programId}/publish`, { method: "PATCH", body: { visibility: "published" } });
    expect(r.json.error).toBe("PUBLISH_REQUIREMENTS_NOT_MET");
  });

  it("hides a draft program from the public", async () => {
    expect((await a.client.req(`/programs/${programSlug}`)).status).toBe(404);
    expect((await admin.req(`/programs/${programSlug}`)).status).toBe(200);
  });

  it("adds courses, publishes, and shows the public page", async () => {
    expect((await admin.req(`/api/admin/programs/${programId}/courses`, { method: "PUT", body: { courses: [{ courseId, isRequired: true }, { courseId, isRequired: true }] } })).json.error).toBe("DUPLICATE_COURSE");
    expect((await admin.req(`/api/admin/programs/${programId}/courses`, { method: "PUT", body: { courses: [{ courseId, isRequired: true }] } })).status).toBe(200);
    expect((await admin.req(`/api/admin/programs/${programId}/publish`, { method: "PATCH", body: { visibility: "published" } })).status).toBe(200);
    const page = await a.client.req(`/programs/${programSlug}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`โปรแกรม ${run}`);
  });

  it("blocks direct enrollment in an unlisted course that belongs to the program", async () => {
    const r = await a.client.req(`/api/courses/${courseId}/enroll`, { method: "POST" });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("PROGRAM_REGISTRATION_REQUIRED");
  });
});

describe("cohorts: dates, eligibility, seats and approval", () => {
  it("validates the timeline", async () => {
    const r = await admin.req(`/api/admin/programs/${programId}/cohorts`, { body: cohortBody({ registrationClosesAt: iso(DAY) }) });
    expect(r.json.error).toBe("COHORT_DATES_INVALID");
  });

  it("creates a draft cohort that nobody can apply to", async () => {
    const r = await admin.req(`/api/admin/programs/${programId}/cohorts`, { body: cohortBody() });
    expect(r.status).toBe(200);
    cohortId = r.json.id;
    expect((await a.client.req(`/api/cohorts/${cohortId}/apply`, { body: { answers: { org: "x" } } })).status).toBe(404);
  });

  it("publishes it; applying before the opening date is refused", async () => {
    expect((await admin.req(`/api/admin/cohorts/${cohortId}/status`, { method: "PATCH", body: { action: "publish" } })).status).toBe(200);
    expect((await a.client.req(`/api/cohorts/${cohortId}/apply`, { body: { answers: { org: "x" } } })).json.error).toBe("REGISTRATION_NOT_OPEN");
  });

  it("opens registration when the admin moves the dates", async () => {
    const r = await admin.req(`/api/admin/cohorts/${cohortId}`, { method: "PATCH", body: cohortBody({ registrationOpensAt: iso(-HOUR), registrationClosesAt: iso(7 * DAY), startsAt: iso(DAY) }) });
    expect(r.status).toBe(200);
  });

  it("requires a completed member profile", async () => {
    const bare = await makeUser("noprofile", ORG, false);
    const r = await bare.client.req(`/api/cohorts/${cohortId}/apply`, { body: { answers: { org: "x" } } });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("PROFILE_REQUIRED");
  });

  it("enforces the email domain, the application form and the instructor rule", async () => {
    const wrongDomain = await outsider.client.req(`/api/cohorts/${cohortId}/apply`, { body: { answers: { org: "x" } } });
    expect(wrongDomain.status).toBe(422);
    expect(wrongDomain.json.error).toBe("NOT_ELIGIBLE");
    expect((await a.client.req(`/api/cohorts/${cohortId}/apply`, { body: { answers: {} } })).json.error).toBe("APPLICATION_INVALID");
    expect((await instructor.req(`/api/cohorts/${cohortId}/apply`, { body: { answers: { org: "x" } } })).json.error).toBe("CANNOT_ENROLL_OWN_COURSE");
  });

  it("queues applicants for review and waitlists them once seats run out", async () => {
    // A spreadsheet formula in an answer must come out neutralized in the CSV export
    expect((await a.client.req(`/api/cohorts/${cohortId}/apply`, { body: { answers: { org: "=HYPERLINK(\"https://evil\")", extra: "dropped" } } })).json.status).toBe("pending");
    expect((await b.client.req(`/api/cohorts/${cohortId}/apply`, { body: { answers: { org: "B" } } })).json.status).toBe("pending");
    expect((await c.client.req(`/api/cohorts/${cohortId}/apply`, { body: { answers: { org: "C" } } })).json.status).toBe("waitlisted");
    expect((await a.client.req(`/api/cohorts/${cohortId}/apply`, { body: { answers: { org: "again" } } })).json.error).toBe("ALREADY_APPLIED");
    const stored = await withDb((db) => db.query("select answers from cohort_registrations where cohort_id = $1 and user_id = $2", [cohortId, a.id]));
    expect(stored.rows[0].answers).toEqual({ org: "=HYPERLINK(\"https://evil\")" });
    expect(await outbox("cohort-application-received", c.email)).toBe(1);
  });

  it("approving enrolls the applicant in every program course, but learning waits for the start date", async () => {
    const regs = await admin.req(`/api/admin/cohorts/${cohortId}`);
    const regA = regs.json.registrations.find((r: any) => r.email === a.email.toLowerCase());
    const r = await admin.req(`/api/admin/cohorts/${cohortId}/registrations`, { method: "PATCH", body: { ids: [regA.id], decision: "approve" } });
    expect(r.json.changed).toBe(1);
    const enr = await withDb((db) => db.query("select status, cohort_id from enrollments where user_id = $1 and course_id = $2", [a.id, courseId]));
    expect(enr.rows[0]).toMatchObject({ status: "in_progress", cohort_id: cohortId });
    expect(await outbox("cohort-application-approved", a.email)).toBe(1);
    expect((await a.client.req(`/api/learning/lessons/${lessonId}/start-session`, { method: "POST" })).json.error).toBe("COHORT_NOT_STARTED");
  });

  it("rejecting frees the seat and promotes the waitlist", async () => {
    const regs = await admin.req(`/api/admin/cohorts/${cohortId}`);
    const regB = regs.json.registrations.find((r: any) => r.email === b.email.toLowerCase());
    const r = await admin.req(`/api/admin/cohorts/${cohortId}/registrations`, { method: "PATCH", body: { ids: [regB.id], decision: "reject", note: "ไม่ตรงกลุ่มเป้าหมาย" } });
    expect(r.json.changed).toBe(1);
    const st = await withDb((db) => db.query("select u.email, r.status from cohort_registrations r join users u on u.id = r.user_id where r.cohort_id = $1", [cohortId]));
    const byEmail = Object.fromEntries(st.rows.map((x: any) => [x.email, x.status]));
    expect(byEmail[b.email.toLowerCase()]).toBe("rejected");
    expect(byEmail[c.email.toLowerCase()]).toBe("pending");
    expect(await outbox("cohort-application-rejected", b.email)).toBe(1);
  });

  it("lets an applicant withdraw before the start", async () => {
    expect((await c.client.req(`/api/cohorts/${cohortId}/apply`, { method: "DELETE" })).status).toBe(200);
    const st = await withDb((db) => db.query("select status from cohort_registrations where cohort_id = $1 and user_id = $2", [cohortId, c.id]));
    expect(st.rows[0].status).toBe("cancelled");
  });

  it("exports registrations as CSV with formulas neutralized, and audits the export", async () => {
    const r = await admin.req(`/api/admin/cohorts/${cohortId}/registrations/export`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.text).toContain("หน่วยงาน");
    expect(r.text).toContain(`"'=HYPERLINK(""https://evil"")"`);
    expect((await a.client.req(`/api/admin/cohorts/${cohortId}/registrations/export`)).status).toBe(403);
    const audit = await withDb((db) => db.query("select count(*)::int as n from audit_logs where action = 'cohort.registrations_exported' and entity_id = $1", [cohortId]));
    expect(audit.rows[0].n).toBe(1);
  });

  it("opens the lessons once the cohort starts", async () => {
    const r = await admin.req(`/api/admin/cohorts/${cohortId}`, { method: "PATCH", body: cohortBody({ registrationOpensAt: iso(-2 * HOUR), startsAt: iso(-HOUR) }) });
    expect(r.status).toBe(200);
    const s = await a.client.req(`/api/learning/lessons/${lessonId}/start-session`, { method: "POST" });
    expect(s.status).toBe(200);
  });

  it("cancelling the cohort revokes what it granted and tells applicants", async () => {
    expect((await admin.req(`/api/admin/cohorts/${cohortId}/status`, { method: "PATCH", body: { action: "cancel" } })).status).toBe(200);
    const enr = await withDb((db) => db.query("select status from enrollments where user_id = $1 and course_id = $2", [a.id, courseId]));
    expect(enr.rows[0].status).toBe("revoked");
    expect(await outbox("cohort-cancelled", a.email)).toBe(1);
  });
});

describe("only one applicant can take the last seat", () => {
  it("handles simultaneous applications without overbooking", async () => {
    const seat = await admin.req(`/api/admin/programs/${programId}/cohorts`, {
      body: cohortBody({ title: `ที่นั่งเดียว ${run}`, registrationOpensAt: iso(-HOUR), startsAt: iso(DAY), capacity: 1, waitlistEnabled: false, requiresApproval: false, eligibility: { emailDomains: [ORG], groupIds: [], requireLegalName: false, prerequisiteCourseIds: [], applicationForm: [] } }),
    });
    expect(seat.status).toBe(200);
    expect((await admin.req(`/api/admin/cohorts/${seat.json.id}/status`, { method: "PATCH", body: { action: "publish" } })).status).toBe(200);
    const racers = await Promise.all(Array.from({ length: 6 }, (_, i) => makeUser(`race${i}`)));
    const results = await Promise.all(racers.map((u) => u.client.req(`/api/cohorts/${seat.json.id}/apply`, { body: { answers: {} } })));
    expect(results.filter((r) => r.json?.status === "approved")).toHaveLength(1);
    expect(results.filter((r) => r.json?.error === "COHORT_FULL")).toHaveLength(5);
  });
});

describe("announcements", () => {
  let id = "";
  let slug = "";
  const body = (over: Record<string, unknown> = {}) => ({
    title: `เปิดรับสมัคร ${run}`,
    summary: "ประชาสัมพันธ์รอบอบรมใหม่",
    body: "## รายละเอียด\n\n- อบรมออนไลน์\n\n<script>alert(1)</script> https://example.com/info",
    kind: "event",
    programId,
    location: "ออนไลน์",
    eventStartsAt: iso(3 * DAY),
    eventEndsAt: iso(4 * DAY),
    publishAt: iso(-HOUR),
    expiresAt: null,
    isPinned: true,
    ...over,
  });

  it("is admin-only", async () => {
    expect((await a.client.req("/api/admin/announcements", { body: body() })).status).toBe(403);
  });

  it("keeps drafts private, previewable by admins", async () => {
    const r = await admin.req("/api/admin/announcements", { body: body() });
    expect(r.status).toBe(200);
    id = r.json.id;
    slug = r.json.slug;
    expect((await a.client.req(`/announcements/${slug}`)).status).toBe(404);
    expect((await admin.req(`/announcements/${slug}`)).status).toBe(200);
  });

  it("publishes, renders text safely, and refuses an email broadcast twice", async () => {
    expect((await admin.req(`/api/admin/announcements/${id}/visibility`, { method: "PATCH", body: { visibility: "published" } })).status).toBe(200);
    const page = await a.client.req(`/announcements/${slug}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`เปิดรับสมัคร ${run}`);
    expect(page.text).not.toContain("<script>alert(1)</script>");
    expect((await a.client.req("/announcements")).text).toContain(`เปิดรับสมัคร ${run}`);
    const first = await admin.req(`/api/admin/announcements/${id}/broadcast`, { method: "POST" });
    expect(first.status).toBe(200);
    expect(first.json.queued).toBeGreaterThan(0);
    expect((await admin.req(`/api/admin/announcements/${id}/broadcast`, { method: "POST" })).json.error).toBe("ANNOUNCEMENT_ALREADY_BROADCAST");
    expect((await admin.req(`/api/admin/announcements/${id}`, { method: "DELETE" })).json.error).toBe("ANNOUNCEMENT_BROADCAST");
  });

  it("hides an expired announcement", async () => {
    const r = await admin.req("/api/admin/announcements", { body: body({ title: `หมดอายุ ${run}`, publishAt: iso(-2 * DAY), expiresAt: iso(-DAY) }) });
    await admin.req(`/api/admin/announcements/${r.json.id}/visibility`, { method: "PATCH", body: { visibility: "published" } });
    expect((await a.client.req(`/announcements/${r.json.slug}`)).status).toBe(404);
    expect((await a.client.req("/announcements")).text).not.toContain(`หมดอายุ ${run}`);
  });

  it("shows upcoming cohorts and pinned announcements to visitors on the landing page", async () => {
    const open = await admin.req(`/api/admin/programs/${programId}/cohorts`, { body: cohortBody({ title: `รุ่นถัดไป ${run}`, registrationOpensAt: iso(DAY), registrationClosesAt: iso(5 * DAY), startsAt: iso(6 * DAY) }) });
    await admin.req(`/api/admin/cohorts/${open.json.id}/status`, { method: "PATCH", body: { action: "publish" } });
    const visitor = new Client();
    const home = await visitor.req("/");
    expect(home.status).toBe(200);
    expect(home.text).toContain("กิจกรรมที่กำลังจะเกิดขึ้น");
    expect(home.text).toContain(`เปิดรับสมัคร ${run}`);
  });
});

describe("pages render", () => {
  it("admin screens render for admins and redirect everyone else", async () => {
    const announcementId = await withDb((db) => db.query("select id from announcements where program_id = $1 limit 1", [programId])).then((r) => r.rows[0].id);
    const pages = ["/admin", "/admin/programs", `/admin/programs/${programId}`, `/admin/cohorts/${cohortId}`, "/admin/announcements", "/admin/announcements/new", `/admin/announcements/${announcementId}`, "/instructor"];
    for (const path of pages) {
      const r = await admin.req(path);
      expect(r.status, path).toBe(200);
    }
    const blocked = await a.client.req("/admin/programs");
    expect([302, 303, 307, 308]).toContain(blocked.status);
  });

  it("learner screens render with the new sections", async () => {
    for (const path of ["/", "/programs", "/announcements", `/courses/${await withDb((db) => db.query("select slug from courses where id = $1", [courseId])).then((r) => r.rows[0].slug)}`]) {
      const r = await a.client.req(path);
      expect(r.status, path).toBe(200);
    }
    expect((await admin.req("/instructor")).text).toContain(`Program course ${run}`);
  });
});

describe("fine-grained administration", () => {
  it("deletes an unused draft but retains published cohorts", async () => {
    const newDraft = await admin.req(`/api/admin/programs/${programId}/cohorts`, { body: cohortBody() });
    expect(newDraft.status).toBe(200);
    const path = `/api/admin/cohorts/${newDraft.json.id}`;
    expect((await instructor.req(path, { method: "DELETE" })).status).toBe(403);
    expect((await admin.req(path, { method: "DELETE" })).json.programId).toBe(programId);
    expect((await admin.req(path)).status).toBe(404);
    expect((await admin.req(`/api/admin/cohorts/${cohortId}`, { method: "DELETE" })).status).toBe(409);
  });

  it("keeps the current session and isolates device removal by account", async () => {
    const member = await makeUser("devices");
    const result = await withDb(db => db.query("select id from user_sessions where user_id = $1", [member.id]));
    const id = result.rows[0].id;
    expect((await member.client.req(`/api/user/sessions/${id}`, { method: "DELETE" })).status).toBe(409);
    expect((await a.client.req(`/api/user/sessions/${id}`, { method: "DELETE" })).status).toBe(404);
    expect((await admin.req(`/api/admin/users/${member.id}/sessions/${id}`, { method: "DELETE" })).status).toBe(200);
    expect((await member.client.req("/api/user/me")).json.id).toBe(null);
  });
});
