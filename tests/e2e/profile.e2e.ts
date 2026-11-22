/**
 * End-to-end: sign-up collects the member profile under the PDPA notice, the national ID is unique per person
 * and never stored in clear, and members finish or update their profile on the account page.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Client, SEED_PASSWORD, profileBody, randomNationalId, resetRateLimits, withDb } from "./helpers.ts";

const run = randomBytes(4).toString("hex");
const email = `member-${run}@e2e.test`;
const password = `correct horse battery ${run}`;
const nationalId = randomNationalId();
const member = new Client();

const register = (over: Record<string, unknown> = {}, profileOver: Record<string, unknown> = {}) =>
  new Client().req("/api/auth/register", { body: { email: `x-${randomBytes(4).toString("hex")}@e2e.test`, password, profile: profileBody(profileOver), pdpaConsent: true, ...over } });

beforeAll(async () => {
  await resetRateLimits();
});

describe("sign-up page", () => {
  it("tells applicants that the system operates under the PDPA and links the full notice", async () => {
    const page = await new Client().req("/register");
    expect(page.status).toBe(200);
    expect(page.text).toContain("PDPA");
    expect(page.text).toContain("/privacy");
    const notice = await new Client().req("/privacy");
    expect(notice.status).toBe(200);
    expect(notice.text).toContain("พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล");
  });
});

describe("sign-up with the member profile", () => {
  it("refuses without consent to the privacy notice", async () => {
    expect((await register({ pdpaConsent: false })).json.error).toBe("PDPA_CONSENT_REQUIRED");
  });

  it("refuses a national ID with a wrong check digit, and a minor without a guardian", async () => {
    const wrong = nationalId.slice(0, 12) + String((Number(nationalId[12]) + 1) % 10);
    const bad = await register({}, { nationalId: wrong });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe("PROFILE_INVALID");
    expect((await register({}, { birthDate: `${new Date().getFullYear() - 15}-01-01` })).json.error).toBe("PROFILE_INVALID");
  });

  it("signs up a minor with the guardian's full name and the applicant's confirmation only", async () => {
    const minor = { birthDate: `${new Date().getFullYear() - 16}-05-05`, titleTh: "นางสาว", titleEn: "Miss" };
    expect((await register({}, { ...minor, guardianName: "นางสมศรี ใจดี" })).json.error).toBe("PROFILE_INVALID"); // not confirmed
    expect((await register({}, { ...minor, guardianName: "สมศรี", guardianConsent: true })).json.error).toBe("PROFILE_INVALID"); // no surname
    const ok = await register({}, { ...minor, guardianName: "นางสมศรี ใจดี", guardianConsent: true });
    expect(ok.status).toBe(200);
  });

  it("creates the account with the profile, stores the ID encrypted, and composes the certificate names", async () => {
    const r = await new Client().req("/api/auth/register", {
      body: { email, password, profile: profileBody({ nationalId, titleTh: "นางสาว", firstNameTh: "สมหญิง", lastNameTh: "ใจงาม", titleEn: "Ms.", firstNameEn: "Somying", lastNameEn: "Jaingam", phone: "+66 89 765 4321" }), pdpaConsent: true },
    });
    expect(r.status).toBe(200);
    const row = await withDb((db) =>
      db.query(
        `select u.legal_full_name_th, u.legal_full_name_en, u.email_verified_at, p.phone, p.national_id_encrypted, p.national_id_last4,
                octet_length(p.national_id_hmac) as mac_len, p.pdpa_notice_version, p.pdpa_consented_at
         from users u join user_profiles p on p.user_id = u.id where u.email = $1`,
        [email],
      ),
    );
    const p = row.rows[0];
    expect(p).toMatchObject({ legal_full_name_th: "นางสาวสมหญิง ใจงาม", legal_full_name_en: "Ms. Somying Jaingam", phone: "0897654321", national_id_last4: nationalId.slice(-4), mac_len: 32, email_verified_at: null });
    expect(p.national_id_encrypted).not.toContain(nationalId);
    expect(p.pdpa_consented_at).toBeTruthy();
    // The national ID must not appear anywhere in clear, audit details included
    const leak = await withDb((db) => db.query("select count(*)::int as n from audit_logs where details::text like $1", [`%${nationalId}%`]));
    expect(leak.rows[0].n).toBe(0);
    const consent = await withDb((db) => db.query("select count(*)::int as n from audit_logs a join users u on u.id = a.user_id where u.email = $1 and a.action = 'user.pdpa_consent'", [email]));
    expect(consent.rows[0].n).toBe(1);
  });

  it("allows one account per national ID", async () => {
    const r = await register({}, { nationalId });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("NATIONAL_ID_IN_USE");
  });
});

describe("profile page", () => {
  beforeAll(async () => {
    // Email verification itself is covered by flow.e2e.ts
    await withDb((db) => db.query("update users set email_verified_at = now() where email = $1", [email]));
    await member.login(email, password);
  });

  it("returns the profile with the national ID masked and no secrets", async () => {
    const r = await member.req("/api/user/profile");
    expect(r.status).toBe(200);
    expect(r.json.profile.national_id_masked).toMatch(/^x-xxxx-xxxx\d-\d\d-\d$/);
    expect(JSON.stringify(r.json)).not.toContain(nationalId);
    expect(r.json.profile.national_id_encrypted).toBeUndefined();
    expect(r.json.profile.national_id_hmac).toBeUndefined();
  });

  it("updates contact details without re-entering the national ID, but never changes the ID", async () => {
    const base = { titleTh: "นางสาว", firstNameTh: "สมหญิง", lastNameTh: "ใจงาม", titleEn: "Ms.", firstNameEn: "Somying", lastNameEn: "Jaingam" };
    const ok = await member.req("/api/user/profile", { method: "PUT", body: profileBody({ ...base, nationalId: "", phone: "0811111111", province: "ขอนแก่น" }) });
    expect(ok.status).toBe(200);
    const after = await member.req("/api/user/profile");
    expect(after.json.profile).toMatchObject({ phone: "0811111111", province: "ขอนแก่น" });
    const change = await member.req("/api/user/profile", { method: "PUT", body: profileBody({ ...base, nationalId: randomNationalId() }) });
    expect(change.json.error).toBe("NATIONAL_ID_LOCKED");
  });

  it("keeps names fixed once the certificate name is locked", async () => {
    expect((await member.req("/api/user/lock-legal-name", { body: { legal_full_name_th: "นางสาวสมหญิง ใจงาม", confirm: true } })).status).toBe(200);
    await member.req("/api/user/profile", { method: "PUT", body: profileBody({ nationalId: "", firstNameTh: "เปลี่ยน", phone: "0822222222" }) });
    const p = await member.req("/api/user/profile");
    expect(p.json.profile.first_name_th).toBe("สมหญิง");
    expect(p.json.profile.phone).toBe("0822222222");
    expect(p.json.namesLocked).toBe(true);
  });

  it("lets a member without a profile (e.g. signed up with Google) complete it once, with consent", async () => {
    const bareEmail = `google-like-${run}@e2e.test`;
    // Same password hash as the seeded learner, so the test can log in normally
    await withDb((db) =>
      db.query("insert into users (email, email_verified_at, password_hash) select $1, now(), password_hash from users where email = 'learner@upskill.test'", [bareEmail]),
    );
    const bare = new Client();
    await bare.login(bareEmail, SEED_PASSWORD);
    expect((await bare.req("/")).text).toContain("กรุณากรอกข้อมูลผู้เรียน");
    expect((await bare.req("/api/user/profile", { method: "PUT", body: profileBody() })).json.error).toBe("PDPA_CONSENT_REQUIRED");
    expect((await bare.req("/api/user/profile", { method: "PUT", body: { ...profileBody(), pdpaConsent: true } })).status).toBe(200);
    expect((await bare.req("/me/profile")).status).toBe(200);
    expect((await bare.req("/")).text).not.toContain("กรุณากรอกข้อมูลผู้เรียน");
  });
});
