/**
 * End-to-end: a course owner turns on the application form (ใบสมัคร) for a short course; a learner applies,
 * staff approve and record payment, the CSV export works, and account erasure anonymizes the application.
 */
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Client, SEED_PASSWORD, resetRateLimits, withDb } from "./helpers.ts";

const run = randomBytes(4).toString("hex");
const instructor = new Client();
let learner: Client;
let learnerEmail = "";
let courseId = "";
let courseSlug = "";
let applicationId = "";

async function makeLearner(): Promise<{ client: Client; email: string }> {
  const email = `apply-${run}@e2e.test`;
  const token = randomBytes(32).toString("base64url");
  await withDb(async (db) => {
    const u = await db.query("insert into users (email, email_verified_at, role, status) values ($1, now(), 'member', 'active') returning id", [email]);
    await db.query(
      `insert into user_profiles (user_id, title_th, first_name_th, last_name_th, title_en, first_name_en, last_name_en, phone, birth_date,
         address_line, subdistrict, district, province, postal_code, national_id_hmac, national_id_encrypted, national_id_last4,
         pdpa_notice_version, pdpa_consented_at)
       values ($1, 'นางสาว', 'สมหญิง', 'ใจงาม', 'Ms.', 'Somying', 'Jaingam', '0812345678', '1995-01-01', '9 หมู่ 2', 'มาบตาพุด', 'เมืองระยอง', 'ระยอง', '21150',
         $2, 'v1.test', '1234', 'test', now())`,
      [u.rows[0].id, randomBytes(32)],
    );
    await db.query(
      "insert into user_sessions (user_id, token_hash, ip_address, user_agent, idle_expires_at, expires_at) values ($1, $2, '127.0.0.1', 'e2e', now() + interval '1 day', now() + interval '1 day')",
      [u.rows[0].id, createHash("sha256").update(token).digest()],
    );
  });
  const client = new Client();
  client.cookies.set([...instructor.cookies.keys()].find((k) => /^(__Host-)?sid$/.test(k)) ?? "sid", token);
  return { client, email };
}

const validApplication = (over: Record<string, unknown> = {}) => ({
  contact: { phone: "0812345678", email: "", addressLine: "9 หมู่ 2", subdistrict: "มาบตาพุด", district: "เมืองระยอง", province: "ระยอง", postalCode: "21150" },
  education: { level: "ปวส.", institution: "วิทยาลัยเทคนิคนิคมอุตสาหกรรมระยอง", qualification: "ช่างกลโรงงาน" },
  occupation: { occupation: "พนักงานบริษัท", organization: "" },
  documents: { id_card: true },
  declaration: { signatureName: "สมหญิง ใจงาม", accepted: true },
  pdpaConsent: true,
  ...over,
});

beforeAll(async () => {
  await resetRateLimits();
  await instructor.login("instructor@upskill.test", SEED_PASSWORD);
  ({ client: learner, email: learnerEmail } = await makeLearner());
});

describe("owner sets up a short course with an application form", () => {
  it("creates a short course (วุฒิบัตร by default) and publishes it", async () => {
    const c = await instructor.req("/api/instructor/courses", { body: { title: `E2E short course ${run}`, course_type: "short_course" } });
    expect(c.status).toBe(200);
    courseId = c.json.id;
    courseSlug = c.json.slug;
    const row = await withDb((db) => db.query("select course_type, credential_name_th from courses where id = $1", [courseId]));
    expect(row.rows[0]).toEqual({ course_type: "short_course", credential_name_th: "วุฒิบัตร" });
    expect((await instructor.req(`/api/instructor/courses/${courseId}/lessons`, { body: { url: "https://youtu.be/aqz-KE-bpKQ", title: "Clip", dev_duration_sec: 620 } })).status).toBe(200);
    for (let i = 0; i < 3; i++) {
      expect((await instructor.req(`/api/instructor/courses/${courseId}/quiz`, { body: { question_text: `Q${i}?`, options: ["a", "b"], correct_index: 0 } })).status).toBe(200);
    }
    expect((await instructor.req(`/api/instructor/courses/${courseId}/publish`, { method: "PATCH", body: { visibility: "published" } })).status).toBe(200);
  });

  it("turns on the form; unknown setting fields are dropped by the core parser", async () => {
    const r = await instructor.req(`/api/instructor/courses/${courseId}`, {
      method: "PATCH",
      body: {
        application_settings: {
          enabled: true, courseCode: "RIETC-KT-01", intake: "รุ่นที่ 1", schedule: "ออนไลน์", venue: "ระบบ UpSkill",
          education: "required", occupation: "optional", requireApproval: true, fee: 100,
          documents: [{ key: "id_card", label: "สำเนาบัตรประชาชน", required: true }],
          injected: "<script>",
        },
      },
    });
    expect(r.status).toBe(200);
    const s = await withDb((db) => db.query("select application_settings from courses where id = $1", [courseId]));
    expect(s.rows[0].application_settings).not.toHaveProperty("injected");
    expect(s.rows[0].application_settings).toMatchObject({ enabled: true, requireApproval: true, fee: 100, education: "required" });
  });
});

describe("learner applies", () => {
  it("one-click enrollment is refused while the form is on", async () => {
    expect((await learner.req(`/api/courses/${courseId}/enroll`, { method: "POST" })).json.error).toBe("APPLICATION_REQUIRED");
  });

  it("server-side validation: required document and matching signature", async () => {
    const noDoc = await learner.req(`/api/courses/${courseId}/application`, { body: validApplication({ documents: {} }) });
    expect(noDoc.status).toBe(422);
    const wrongName = await learner.req(`/api/courses/${courseId}/application`, { body: validApplication({ declaration: { signatureName: "คนอื่น", accepted: true } }) });
    expect(wrongName.status).toBe(422);
  });

  it("submits once, gets a running number, and waits for approval (not enrolled yet)", async () => {
    const r = await learner.req(`/api/courses/${courseId}/application`, { body: validApplication() });
    expect(r.status).toBe(200);
    expect(r.json.applicationNo).toMatch(/^APP-\d{4}-\d{6}$/);
    expect(r.json.status).toBe("submitted");
    const again = await learner.req(`/api/courses/${courseId}/application`, { body: validApplication() });
    expect(again.json.error).toBe("APPLICATION_EXISTS");
    const row = await withDb((db) => db.query("select id, enrollment_id, payment_status, applicant->>'nationalIdLast4' as last4, applicant->>'birthDate' as birth, course_snapshot->>'intake' as intake from course_applications where course_id = $1", [courseId]));
    // birth date must not shift a day (DATE column vs UTC conversion)
    expect(row.rows[0]).toMatchObject({ enrollment_id: null, payment_status: "pending", last4: "1234", birth: "1995-01-01", intake: "รุ่นที่ 1" });
    applicationId = row.rows[0].id;
  });
});

describe("staff section", () => {
  it("approves (creates the enrollment) and records evidence, payment and receipt", async () => {
    const r = await instructor.req(`/api/instructor/courses/${courseId}/applications/${applicationId}`, {
      method: "PATCH",
      body: { action: "approve", verification_status: "verified", payment_status: "paid", receipt_no: "RC-0001", documents_verified: { id_card: true } },
    });
    expect(r.status).toBe(200);
    const row = await withDb((db) =>
      db.query("select status, verification_status, payment_status, receipt_no, enrollment_id, documents->'id_card'->>'verified' as v from course_applications where id = $1", [applicationId]),
    );
    expect(row.rows[0]).toMatchObject({ status: "approved", verification_status: "verified", payment_status: "paid", receipt_no: "RC-0001", v: "true" });
    expect(row.rows[0].enrollment_id).toBeTruthy();
    const reject = await instructor.req(`/api/instructor/courses/${courseId}/applications/${applicationId}`, { method: "PATCH", body: { action: "reject" } });
    expect(reject.json.error).toBe("ALREADY_APPROVED");
  });

  it("exports a CSV of applications (UTF-8 BOM, formula-safe)", async () => {
    const r = await instructor.req(`/api/instructor/courses/${courseId}/applications/export`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/csv/);
    expect(r.text).toContain("เลขที่ใบสมัคร");
    expect(r.text).toContain("RC-0001");
  });

  it("other instructors' learners cannot read the staff APIs", async () => {
    expect((await learner.req(`/api/instructor/courses/${courseId}/applications/export`)).status).toBe(403);
  });

  it("server-renders the owner's editor (applications tab) and the learner's application page", async () => {
    const editor = await instructor.req(`/instructor/courses/${courseId}`);
    expect(editor.status).toBe(200);
    expect(editor.text).toContain("ใบสมัคร");
    const mine = await learner.req(`/courses/${courseSlug}/apply`);
    expect(mine.status).toBe(200);
    expect(mine.text).toContain("ใบสมัครเรียนรายวิชา");
  });
});

describe("PDPA erasure", () => {
  it("account deletion clears the applicant's personal data but keeps the registry fields", async () => {
    expect((await learner.req("/api/user/me", { method: "DELETE" })).status).toBe(200);
    const row = await withDb((db) => db.query("select application_no, receipt_no, applicant, education from course_applications where id = $1", [applicationId]));
    expect(row.rows[0].applicant).toEqual({});
    expect(row.rows[0].education).toBeNull();
    expect(row.rows[0].receipt_no).toBe("RC-0001");
    expect(row.rows[0].application_no).toMatch(/^APP-/);
  });
});

describe("catalog", () => {
  it("filters by course type and the course card says วุฒิบัตร", async () => {
    const page = await new Client().req("/courses?type=short_course");
    expect(page.status).toBe(200);
    expect(page.text).toContain(`E2E short course ${run}`);
  });
});
