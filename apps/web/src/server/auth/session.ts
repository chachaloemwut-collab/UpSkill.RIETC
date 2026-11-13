/**
 * Opaque server-side sessions (spec: HttpOnly cookie + user_sessions).
 *
 * Cookie: __Host-sid; HttpOnly; Secure; SameSite=Lax; Path=/
 *  - __Host- prefix: blocks subdomains from overwriting the cookie (cookie tossing)
 *  - [CHANGED] Lax instead of the spec's Strict: with Strict, a user who clicks a link from LINE/email/Google
 *    shows up as "logged out" on the first page load, and the OAuth callback breaks. CSRF is covered by
 *    the Origin check in http.ts instead.
 */
import "server-only";
import { cookies } from "next/headers";
import { generateToken, hashToken } from "@upskill/core";
import { ctx } from "../context";

const IS_PROD = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = IS_PROD ? "__Host-sid" : "sid";
const IDLE_MS = 7 * 24 * 3600_000;
const ABSOLUTE_MS = 30 * 24 * 3600_000;
const TOUCH_EVERY_MS = 5 * 60_000;

export interface CurrentUser {
  id: string;
  sessionId: string;
  email: string;
  role: "member" | "instructor" | "admin";
  sessionCreatedAt: Date;
}

export async function createSession(userId: string, meta: { ip: string; userAgent: string }): Promise<void> {
  const { db } = ctx();
  const token = generateToken();
  const now = Date.now();
  await db
    .insertInto("user_sessions")
    .values({
      user_id: userId,
      token_hash: hashToken(token),
      ip_address: meta.ip,
      user_agent: meta.userAgent,
      idle_expires_at: new Date(now + IDLE_MS),
      expires_at: new Date(now + ABSOLUTE_MS),
    })
    .execute();

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_MS / 1000,
  });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  const { db } = ctx();

  const row = await db
    .selectFrom("user_sessions as s")
    .innerJoin("users as u", "u.id", "s.user_id")
    .select(["s.id as sessionId", "s.last_seen_at", "s.created_at", "u.id", "u.email", "u.role"])
    .where("s.token_hash", "=", hashToken(token))
    .where("s.revoked_at", "is", null)
    .where("s.expires_at", ">", new Date())
    .where("s.idle_expires_at", ">", new Date())
    .where("u.status", "=", "active")
    .executeTakeFirst();
  if (!row) return null;

  // Sliding idle expiry, at most once every 5 minutes (keeps DB writes down)
  if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_EVERY_MS) {
    await db
      .updateTable("user_sessions")
      .set({ last_seen_at: new Date(), idle_expires_at: new Date(Date.now() + IDLE_MS) })
      .where("id", "=", row.sessionId)
      .execute();
  }
  return {
    id: row.id,
    sessionId: row.sessionId,
    email: row.email,
    role: row.role as CurrentUser["role"],
    sessionCreatedAt: new Date(row.created_at),
  };
}

/** Call on password change/reset, ban, or account takeover (spec 5.1 #2) */
export async function revokeAllSessions(userId: string, reason: string, exceptSessionId?: string): Promise<void> {
  const { db } = ctx();
  let q = db
    .updateTable("user_sessions")
    .set({ revoked_at: new Date(), revoked_reason: reason })
    .where("user_id", "=", userId)
    .where("revoked_at", "is", null);
  if (exceptSessionId) q = q.where("id", "!=", exceptSessionId);
  await q.execute();
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await ctx()
      .db.updateTable("user_sessions")
      .set({ revoked_at: new Date(), revoked_reason: "logout" })
      .where("token_hash", "=", hashToken(token))
      .execute();
  }
  jar.delete(SESSION_COOKIE);
}
