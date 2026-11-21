/**
 * Per-course certificate signature (admin only): upload, show/hide switch, and the rule that a signer is
 * printed only with a signature image. The course's original credential settings are restored afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, Client, SEED_PASSWORD, resetRateLimits, withDb } from "./helpers.ts";

// 1×1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const admin = new Client();
const instructor = new Client();
let courseId = "";
let original: { credential_signer_name: string | null; credential_signature_key: string | null; credential_show_signer: boolean } | null = null;

async function upload(c: Client, bytes: Uint8Array) {
  const res = await fetch(`${BASE}/api/admin/courses/${courseId}/signature`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "image/png", cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join("; ") },
    body: bytes,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

beforeAll(async () => {
  await resetRateLimits();
  await admin.login("admin@upskill.test", SEED_PASSWORD);
  await instructor.login("instructor@upskill.test", SEED_PASSWORD);
  await withDb(async (db) => {
    const row = (await db.query("SELECT id, credential_signer_name, credential_signature_key, credential_show_signer FROM courses ORDER BY created_at LIMIT 1")).rows[0];
    courseId = row.id;
    original = { credential_signer_name: row.credential_signer_name, credential_signature_key: row.credential_signature_key, credential_show_signer: row.credential_show_signer };
    await db.query("UPDATE courses SET credential_signer_name = NULL, credential_signature_key = NULL, credential_show_signer = false WHERE id = $1", [courseId]);
  });
});

afterAll(async () => {
  if (!original) return;
  await withDb((db) =>
    db.query("UPDATE courses SET credential_signer_name = $2, credential_signature_key = $3, credential_show_signer = $4 WHERE id = $1", [
      courseId, original!.credential_signer_name, original!.credential_signature_key, original!.credential_show_signer,
    ]),
  );
});

describe("course signature", () => {
  it("is admin-only", async () => {
    expect((await upload(instructor, PNG)).status).toBe(403);
    expect((await instructor.req(`/api/admin/courses/${courseId}/signer`, { method: "PATCH", body: { show: true } })).status).toBe(403);
  });

  it("cannot show a signer without a signature", async () => {
    const r = await admin.req(`/api/admin/courses/${courseId}/signer`, { method: "PATCH", body: { show: true } });
    expect(r.json.error).toBe("NO_SIGNATURE");
  });

  it("rejects files that are not PNG/JPG", async () => {
    expect((await upload(admin, new TextEncoder().encode("<svg onload=alert(1)>"))).status).toBe(415);
  });

  it("stores the image content-addressed and serves it back to admins only", async () => {
    expect((await upload(admin, PNG)).status).toBe(200);
    const key = await withDb(async (db) => (await db.query("SELECT credential_signature_key AS k FROM courses WHERE id = $1", [courseId])).rows[0].k as string);
    expect(key).toMatch(/^[0-9a-f]{64}\.png$/);
    const img = await admin.req(`/api/admin/courses/${courseId}/signature`);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect((await instructor.req(`/api/admin/courses/${courseId}/signature`)).status).toBe(403);
  });

  it("needs a signer name before the switch can turn on, then turns on", async () => {
    expect((await admin.req(`/api/admin/courses/${courseId}/signer`, { method: "PATCH", body: { show: true } })).json.error).toBe("NO_SIGNER_NAME");
    await withDb((db) => db.query("UPDATE courses SET credential_signer_name = 'ผู้ลงนามทดสอบ' WHERE id = $1", [courseId]));
    const r = await admin.req(`/api/admin/courses/${courseId}/signer`, { method: "PATCH", body: { show: true } });
    expect(r.status).toBe(200);
    expect(r.json.showSigner).toBe(true);
  });

  it("removing the signature also turns the signer off", async () => {
    const r = await admin.req(`/api/admin/courses/${courseId}/signature`, { method: "DELETE" });
    expect(r.status).toBe(200);
    const row = await withDb(async (db) => (await db.query("SELECT credential_signature_key AS k, credential_show_signer AS s FROM courses WHERE id = $1", [courseId])).rows[0]);
    expect(row).toEqual({ k: null, s: false });
  });

  it("refuses a course settings save based on a stale copy (two editors at once)", async () => {
    const stale = "2000-01-01T00:00:00.000Z";
    const r = await admin.req(`/api/instructor/courses/${courseId}`, { method: "PATCH", body: { passing_quiz_score: 80, expected_updated_at: stale } });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("EDIT_CONFLICT");
    const current = await withDb(async (db) => (await db.query("SELECT updated_at FROM courses WHERE id = $1", [courseId])).rows[0].updated_at as Date);
    const ok = await admin.req(`/api/instructor/courses/${courseId}`, { method: "PATCH", body: { passing_quiz_score: 80, expected_updated_at: current.toISOString() } });
    expect(ok.status).toBe(200);
  });
});
