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
import { cache } from "react";
import { cookies } from "next/headers";
import { generateToken, hashToken } from "@upskill/core";
import { isHttpsOrigin } from "@upskill/infra/env";
import { ctx } from "../context";

/** __Host- requires Secure, so it is only used on https origins (plain http://localhost in dev gets "sid") */
function cookieName(): string {
  return isHttpsOrigin(ctx().env) ? "__Host-sid" : "sid";
}
const IDLE_MS = 7 * 24 * 3600_000;
const ABSOLUTE_MS = 30 * 24 * 3600_000;
const TOUCH_EVERY_MS = 5 * 60_000;

export interface CurrentUser {
  id: string;
  sessionId: string;
  email: string;
  username: string | null;
  isSystemOwner: boolean;
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

  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    secure: isHttpsOrigin(ctx().env),
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_MS / 1000,
  });
}

/** Memoized per server render: the layout, page and helpers share one session lookup. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token || token.length > 128) return null;
  const { db } = ctx();

  const row = await db
    .selectFrom("user_sessions as s")
    .innerJoin("users as u", "u.id", "s.user_id")
    .select(["s.id as sessionId", "s.last_seen_at", "s.created_at", "u.id", "u.email", "u.username", "u.is_system_owner", "u.role", "u.scoped_management"])
    .where("s.token_hash", "=", hashToken(token))
    .where("s.revoked_at", "is", null)
    .where("s.expires_at", ">", new Date())
    .where("s.idle_expires_at", ">", new Date())
    .where("u.status", "=", "active")
    .where("u.deleted_at", "is", null)
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
    username: row.username,
    isSystemOwner: row.is_system_owner,
    role: row.role === "admin" && row.scoped_management && !row.is_system_owner ? "member" : row.role as CurrentUser["role"],
    sessionCreatedAt: new Date(row.created_at),
  };
});

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
  const token = jar.get(cookieName())?.value;
  if (token) {
    await ctx()
      .db.updateTable("user_sessions")
      .set({ revoked_at: new Date(), revoked_reason: "logout" })
      .where("token_hash", "=", hashToken(token))
      .execute();
  }
  jar.delete(cookieName());
}
