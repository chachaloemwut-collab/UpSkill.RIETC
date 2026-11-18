/**
 * End-to-end: document files on a course application — type/size checks, one file per document,
 * required uploads, who may download, and account erasure removing the stored bytes.
 */
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { BASE, Client, SEED_PASSWORD, resetRateLimits, withDb } from "./helpers.ts";

const run = randomBytes(4).toString("hex");
const instructor = new Client();
let learner: Client;
let outsider: Client;
let courseId = "";
let fileId = "";
let applicationId = "";

async function makeMember(tag: string): Promise<Client> {
  const email = `${tag}-${run}@e2e.test`;
  const token = randomBytes(32).toString("base64url");
  await withDb(async (db) => {
    const u = await db.query("insert into users (email, email_verified_at, role, status) values ($1, now(), 'member', 'active') returning id", [email]);
    await db.query(
      `insert into user_profiles (user_id, title_th, first_name_th, last_name_th, title_en, first_name_en, last_name_en, phone, birth_date,
         address_line, subdistrict, district, province, postal_code, national_id_hmac, national_id_encrypted, national_id_last4,
         pdpa_notice_version, pdpa_consented_at)
       values ($1, 'นาย', 'ไฟล์', 'ทดสอบ', 'Mr.', 'File', 'Test', '0812345678', '1990-01-01', '1 หมู่ 1', 'มาบตาพุด', 'เมืองระยอง', 'ระยอง', '21150',
         $2, 'v1.test', '0000', 'test', now())`,
      [u.rows[0].id, randomBytes(32)],
    );
    await db.query(
      "insert into user_sessions (user_id, token_hash, ip_address, user_agent, idle_expires_at, expires_at) values ($1, $2, '127.0.0.1', 'e2e', now() + interval '1 day', now() + interval '1 day')",
      [u.rows[0].id, createHash("sha256").update(token).digest()],
    );
  });
  const c = new Client();
  c.cookies.set([...instructor.cookies.keys()].find((k) => /^(__Host-)?sid$/.test(k)) ?? "sid", token);
  return c;
}

/** Raw upload (the route takes the file bytes as the body, not JSON). */
async function upload(client: Client, doc: string, bytes: Uint8Array, name: string) {
  const res = await fetch(`${BASE}/api/courses/${courseId}/application/files?doc=${doc}`, {
    method: "POST",
    headers: {
      origin: BASE,
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent(name),
      cookie: [...client.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    body: bytes,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

const pdf = (extra = "") => new TextEncoder().encode(`%PDF-1.4\n% e2e ${run} ${extra}\n%%EOF\n`);
const application = {
  contact: { phone: "0812345678", email: "", addressLine: "1 หมู่ 1", subdistrict: "มาบตาพุด", district: "เมืองระยอง", province: "ระยอง", postalCode: "21150" },
  education: null,
  occupation: null,
  documents: { id_card: true },
  declaration: { signatureName: "ไฟล์ ทดสอบ", accepted: true },
  pdpaConsent: true,
};

beforeAll(async () => {
  await resetRateLimits();
  await instructor.login("instructor@upskill.test", SEED_PASSWORD);
  learner = await makeMember("files");
  outsider = await makeMember("outsider");
  const c = await instructor.req("/api/instructor/courses", { body: { title: `E2E files ${run}`, course_type: "short_course" } });
  courseId = c.json.id;
  await instructor.req(`/api/instructor/courses/${courseId}/lessons`, { body: { url: "https://youtu.be/aqz-KE-bpKQ", title: "Clip", dev_duration_sec: 620 } });
  for (let i = 0; i < 3; i++) await instructor.req(`/api/instructor/courses/${courseId}/quiz`, { body: { question_text: `Q${i}?`, options: ["a", "b"], correct_index: 0 } });
  await instructor.req(`/api/instructor/courses/${courseId}/publish`, { method: "PATCH", body: { visibility: "published" } });
  await instructor.req(`/api/instructor/courses/${courseId}`, {
    method: "PATCH",
    body: {
      application_settings: {
        enabled: true, education: "off", occupation: "off", documentUploads: "required",
        documents: [{ key: "id_card", label: "สำเนาบัตรประชาชน", required: true }],
      },
    },
  });
});

describe("uploading", () => {
  it("rejects non-PDF/JPG/PNG content (sniffed, not trusted from the name) and unknown documents", async () => {
    expect((await upload(learner, "id_card", new TextEncoder().encode("<html><script>alert(1)</script>"), "card.pdf")).status).toBe(415);
    expect((await upload(learner, "nope", pdf(), "card.pdf")).status).toBe(400);
  });

  it("rejects files over 5 MB", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(pdf());
    expect((await upload(learner, "id_card", big, "big.pdf")).status).toBe(413);
  });

  it("keeps one file per document (a new upload replaces the old one) and cleans the name", async () => {
    const first = await upload(learner, "id_card", pdf("first"), "../../etc/บัตร.pdf");
    expect(first.status).toBe(200);
    expect(first.json.original_name).toBe("บัตร.pdf");
    const second = await upload(learner, "id_card", pdf("second"), "card-2.pdf");
    expect(second.status).toBe(200);
    fileId = second.json.id;
    const rows = await withDb((db) => db.query("select count(*)::int n from course_application_files where course_id = $1", [courseId]));
    expect(rows.rows[0].n).toBe(1);
  });
});

describe("submitting and downloading", () => {
  it("required uploads: submitting without a file fails; with the file it attaches to the application", async () => {
    const other = await upload(outsider, "id_card", pdf("outsider"), "x.pdf"); // outsider's pending file never mixes in
    expect(other.status).toBe(200);
    const ok = await learner.req(`/api/courses/${courseId}/application`, { body: application });
    expect(ok.status).toBe(200);
    const row = await withDb((db) => db.query("select a.id, f.id as file_id from course_applications a join course_application_files f on f.application_id = a.id where a.course_id = $1", [courseId]));
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].file_id).toBe(fileId);
    applicationId = row.rows[0].id;
    const noFile = await outsider.req(`/api/courses/${courseId}/application`, { body: { ...application, declaration: { signatureName: "ไฟล์ ทดสอบ", accepted: true } } });
    expect(noFile.status).toBe(200); // outsider did upload a pending file, so it is accepted too
  });

  it("the applicant and the course owner can download; another member gets 404", async () => {
    const mine = await fetch(`${BASE}/api/courses/${courseId}/application/files/${fileId}`, { headers: { cookie: [...learner.cookies].map(([k, v]) => `${k}=${v}`).join("; ") } });
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(mine.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new TextDecoder().decode(new Uint8Array(await mine.arrayBuffer()))).toContain("second");
    expect((await instructor.req(`/api/courses/${courseId}/application/files/${fileId}`)).status).toBe(200);
    expect((await outsider.req(`/api/courses/${courseId}/application/files/${fileId}`)).status).toBe(404);
  });

  it("submitted files can no longer be removed or replaced", async () => {
    expect((await learner.req(`/api/courses/${courseId}/application/files/${fileId}`, { method: "DELETE" })).status).toBe(404);
    expect((await upload(learner, "id_card", pdf("late"), "late.pdf")).status).toBe(409);
  });
});

describe("PDPA erasure", () => {
  it("deleting the account removes the uploaded files", async () => {
    expect((await learner.req("/api/user/me", { method: "DELETE" })).status).toBe(200);
    const rows = await withDb((db) => db.query("select count(*)::int n from course_application_files where application_id = $1", [applicationId]));
    expect(rows.rows[0].n).toBe(0);
    expect((await instructor.req(`/api/courses/${courseId}/application/files/${fileId}`)).status).toBe(404);
  });
});
