import { completedHours } from "@upskill/core/study-hours";
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeNationalId } from "@upskill/core/profile";
import { isValidAllowlistEntry, parsePartnerKey, type PartnerScope } from "@upskill/core/partner-api";
import { nationalIdDigest } from "@upskill/infra/secret-box";
import { ctx } from "../context";
import { HttpError } from "../http";
import { audit } from "../audit";

/**
 * Partner (server-to-server) API for other agencies' systems. Contract: docs/PARTNER_API.md.
 * A partner sends a national ID it already holds and receives that person's completed trainings and certificates.
 * National IDs are never returned, logged or stored by this API.
 */

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export interface PartnerClient {
  id: string;
  name: string;
  scopes: string[];
  allowedIps: string[];
  expiresAt: Date;
}

/** Find the client for a presented key. Every failure looks the same to the caller. */
export async function findPartnerClient(rawKey: string | null): Promise<PartnerClient> {
  const parsed = parsePartnerKey(rawKey);
  if (!parsed) throw new HttpError(401, "INVALID_API_KEY");
  const row = await ctx()
    .db.selectFrom("partner_api_clients")
    .select(["id", "name", "key_hash", "scopes", "allowed_ips", "expires_at", "revoked_at"])
    .where("key_prefix", "=", parsed.prefix)
    .executeTakeFirst();
  // Compare even when the row is missing, so timing does not reveal which prefixes exist
  const expected = Buffer.from(row?.key_hash ?? "0".repeat(64), "hex");
  const presented = Buffer.from(sha256(parsed.key), "hex");
  const same = expected.length === presented.length && timingSafeEqual(expected, presented);
  if (!row || !same || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) throw new HttpError(401, "INVALID_API_KEY");
  return { id: row.id, name: row.name, scopes: row.scopes, allowedIps: row.allowed_ips, expiresAt: new Date(row.expires_at) };
}

export function requireScope(client: PartnerClient, scope: PartnerScope) {
  if (!client.scopes.includes(scope)) throw new HttpError(403, "SCOPE_NOT_GRANTED");
}

export async function logPartnerRequest(entry: {
  clientId: string | null;
  endpoint: string;
  ip: string;
  status: number;
  errorCode?: string | null;
  matched?: boolean | null;
  resultCount?: number | null;
  reference?: string | null;
}) {
  const { db } = ctx();
  await db
    .insertInto("partner_api_requests")
    .values({
      client_id: entry.clientId,
      endpoint: entry.endpoint,
      ip: entry.ip.slice(0, 64),
      status: entry.status,
      error_code: entry.errorCode ?? null,
      matched: entry.matched ?? null,
      result_count: entry.resultCount ?? null,
      reference: entry.reference ?? null,
    })
    .execute();
  if (entry.clientId && entry.status < 400) {
    await db.updateTable("partner_api_clients").set({ last_used_at: new Date() }).where("id", "=", entry.clientId).execute();
  }
}

export interface TrainingRecord {
  course_title: string;
  course_code: string | null;
  completed_at: string;
  study_hours: number | null;
  certificate: { code: string; status: "valid" | "expired" | "revoked"; issued_at: string; expires_at: string | null; verify_url: string } | null;
}

export interface TrainingLookupResult {
  found: boolean;
  person: { name_th: string | null; name_en: string | null } | null;
  trainings: TrainingRecord[];
}

/** Completed trainings for the person holding this national ID (nothing about trainings still in progress). */
export async function lookupTrainingByNationalId(rawNationalId: string): Promise<TrainingLookupResult> {
  const nationalId = normalizeNationalId(rawNationalId);
  if (!nationalId) throw new HttpError(400, "INVALID_NATIONAL_ID");
  const { db, env } = ctx();
  const digest = nationalIdDigest(nationalId, env.SETTINGS_ENCRYPTION_KEY);
  const person = await db
    .selectFrom("user_profiles as p")
    .innerJoin("users as u", "u.id", "p.user_id")
    .select(["u.id", "u.legal_full_name_th", "u.legal_full_name_en", "u.status"])
    .where("p.national_id_hmac", "=", digest)
    .executeTakeFirst();
  if (!person || person.status === "deleted") return { found: false, person: null, trainings: [] };

  const rows = await db
    .selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .leftJoin("certificates as cert", (j) =>
      j.onRef("cert.user_id", "=", "e.user_id").onRef("cert.course_id", "=", "e.course_id").on("cert.document_type_snapshot", "<>", "development_test"),
    )
    .select([
      "c.title", "c.application_settings", "e.completed_at",
      "cert.certificate_code", "cert.issued_at", "cert.expires_at", "cert.revoked_at", "cert.total_actual_study_sec",
    ])
    .where("e.user_id", "=", person.id)
    .where("e.status", "=", "completed")
    .where("e.completed_at", "is not", null)
    .orderBy("e.completed_at", "desc")
    .execute();

  const trainings: TrainingRecord[] = rows.map((r) => {
    const settings = (r.application_settings ?? {}) as { courseCode?: string };
    const expired = r.expires_at ? new Date(r.expires_at).getTime() <= Date.now() : false;
    return {
      course_title: r.title,
      course_code: settings.courseCode?.trim() || null,
      completed_at: new Date(r.completed_at!).toISOString(),
      study_hours: r.total_actual_study_sec != null ? completedHours(r.total_actual_study_sec) : null,
      certificate: r.certificate_code
        ? {
            code: r.certificate_code,
            status: r.revoked_at ? "revoked" : expired ? "expired" : "valid",
            issued_at: new Date(r.issued_at!).toISOString(),
            expires_at: r.expires_at ? new Date(r.expires_at).toISOString() : null,
            verify_url: `${env.APP_ORIGIN}/verify/${encodeURIComponent(r.certificate_code)}`,
          }
        : null,
    };
  });
  return { found: true, person: { name_th: person.legal_full_name_th, name_en: person.legal_full_name_en }, trainings };
}

/* ---------- administration ---------- */

export async function listPartnerClients() {
  return ctx()
    .db.selectFrom("partner_api_clients")
    .select(["id", "name", "purpose", "key_prefix", "scopes", "allowed_ips", "created_at", "expires_at", "revoked_at", "last_used_at"])
    .orderBy("created_at", "desc")
    .execute();
}

/** Returns the key once; only its hash is stored. */
export async function createPartnerClient(
  adminId: string,
  input: { name: string; purpose: string; allowedIps: string[]; days: number },
  ip: string,
): Promise<{ id: string; key: string }> {
  const ips = [...new Set(input.allowedIps.map((s) => s.trim()).filter(Boolean))];
  if (ips.length === 0 || ips.length > 50 || !ips.every(isValidAllowlistEntry)) throw new HttpError(400, "INVALID_ALLOWLIST");
  const prefix = randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(12, "0").slice(0, 12);
  const key = `upk_${prefix}_${randomBytes(32).toString("base64url")}`;
  const { db } = ctx();
  const row = await db
    .insertInto("partner_api_clients")
    .values({
      name: input.name.trim(),
      purpose: input.purpose.trim(),
      key_prefix: prefix,
      key_hash: sha256(key),
      allowed_ips: ips,
      created_by: adminId,
      expires_at: new Date(Date.now() + input.days * 86_400_000),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await audit(db, { action: "admin.partner_client_created", userId: adminId, entityType: "partner_api_client", entityId: row.id, ip, details: { name: input.name, allowedIps: ips, days: input.days } });
  return { id: row.id, key };
}

export async function revokePartnerClient(adminId: string, id: string, ip: string) {
  const { db } = ctx();
  const r = await db
    .updateTable("partner_api_clients")
    .set({ revoked_at: new Date(), revoked_by: adminId })
    .where("id", "=", id)
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  if (!r.numUpdatedRows) throw new HttpError(404, "NOT_FOUND");
  await audit(db, { action: "admin.partner_client_revoked", userId: adminId, entityType: "partner_api_client", entityId: id, ip });
}

export async function partnerRequestStats(clientId: string) {
  return ctx()
    .db.selectFrom("partner_api_requests")
    .select(["endpoint", "status", "error_code", "matched", "result_count", "reference", "ip", "created_at"])
    .where("client_id", "=", clientId)
    .orderBy("created_at", "desc")
    .limit(50)
    .execute();
}
