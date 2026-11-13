/**
 * Email/password + Google account flows (spec 5.1).
 *
 * Anti-enumeration: register / forgot-password / resend-verification always return the same response
 * whether or not the email exists. Login returns a single INVALID_CREDENTIALS error and runs a dummy hash
 * for unknown emails so response time is the same.
 */
import "server-only";
import { decideGoogleSignIn, generateToken, hashToken, normalizeName, type GoogleClaims } from "@upskill/core";
import { PG, pgErrorCode } from "@upskill/db";
import { hashPassword, validatePasswordPolicy, verifyPassword } from "@upskill/infra/password";
import { ctx } from "../context";
import { HttpError } from "../http";
import { audit } from "../audit";
import { enqueueEmail } from "../queue";
import { createSession, revokeAllSessions } from "./session";

const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_EMAIL_TTL_MS = 15 * 60_000; // spec: 15 minutes
const RESET_GOOGLE_TTL_MS = 5 * 60_000; // spec: 5 minutes

type Meta = { ip: string; userAgent: string };

function assertPassword(pw: string) {
  const problem = validatePasswordPolicy(pw);
  if (problem) throw new HttpError(400, "WEAK_PASSWORD", problem);
}

async function sendVerification(userId: string, email: string) {
  const { db, env } = ctx();
  const token = generateToken();
  await db
    .insertInto("email_verification_tokens")
    .values({ user_id: userId, email, token_hash: hashToken(token), expires_at: new Date(Date.now() + VERIFY_TTL_MS) })
    .execute();
  await enqueueEmail({ template: "verify-email", to: email, link: `${env.APP_ORIGIN}/verify-email?token=${token}` });
}

export async function register(input: { email: string; password: string }): Promise<void> {
  assertPassword(input.password);
  const { db } = ctx();
  const email = input.email.trim().toLowerCase();

  const existing = await db.selectFrom("users").select(["id", "email_verified_at"]).where("email", "=", email).executeTakeFirst();
  if (existing) {
    // Re-send only to unverified accounts; the response is identical either way
    if (!existing.email_verified_at) await sendVerification(existing.id, email);
    return;
  }

  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db
      .insertInto("users")
      .values({ email, password_hash: passwordHash, password_updated_at: new Date() })
      .returning("id")
      .executeTakeFirstOrThrow();
    await sendVerification(user.id, email);
  } catch (err) {
    if (pgErrorCode(err) === PG.UNIQUE_VIOLATION) return; // concurrent register: same generic response
    throw err;
  }
}

export async function resendVerification(emailRaw: string): Promise<void> {
  const { db } = ctx();
  const email = emailRaw.trim().toLowerCase();
  const user = await db.selectFrom("users").select(["id", "email_verified_at"]).where("email", "=", email).executeTakeFirst();
  if (user && !user.email_verified_at) await sendVerification(user.id, email);
}

export async function verifyEmail(token: string): Promise<void> {
  const { db } = ctx();
  await db.transaction().execute(async (trx) => {
    const t = await trx
      .selectFrom("email_verification_tokens as t")
      .innerJoin("users as u", "u.id", "t.user_id")
      .select(["t.id", "t.user_id", "t.email as token_email", "u.email as user_email"])
      .where("t.token_hash", "=", hashToken(token))
      .where("t.used_at", "is", null)
      .where("t.expires_at", ">", new Date())
      .forUpdate("t")
      .executeTakeFirst();
    // The link only verifies the address it was sent to (protects against verifying a changed email)
    if (!t || t.token_email.toLowerCase() !== t.user_email.toLowerCase()) throw new HttpError(400, "INVALID_OR_EXPIRED_TOKEN");
    await trx.updateTable("email_verification_tokens").set({ used_at: new Date() }).where("id", "=", t.id).execute();
    await trx.updateTable("users").set({ email_verified_at: new Date() }).where("id", "=", t.user_id).where("email_verified_at", "is", null).execute();
  });
}

export async function login(input: { email: string; password: string }, meta: Meta): Promise<void> {
  const { db } = ctx();
  const email = input.email.trim().toLowerCase();
  const user = await db
    .selectFrom("users")
    .select(["id", "password_hash", "status", "email_verified_at"])
    .where("email", "=", email)
    .executeTakeFirst();

  const ok = await verifyPassword(user?.password_hash, input.password);
  if (!user || !ok) {
    await audit(db, { action: "auth.login_failed", userId: user?.id ?? null, ip: meta.ip, userAgent: meta.userAgent });
    throw new HttpError(401, "INVALID_CREDENTIALS");
  }
  // Only reveal these after the password was proven correct
  if (user.status !== "active") throw new HttpError(403, "ACCOUNT_DISABLED");
  if (!user.email_verified_at) throw new HttpError(403, "EMAIL_NOT_VERIFIED");

  await createSession(user.id, meta);
  await audit(db, { action: "auth.login", userId: user.id, ip: meta.ip, userAgent: meta.userAgent, details: { method: "password" } });
}

export async function forgotPassword(emailRaw: string): Promise<void> {
  const { db, env } = ctx();
  const email = emailRaw.trim().toLowerCase();
  const user = await db.selectFrom("users").select(["id", "status"]).where("email", "=", email).executeTakeFirst();
  if (!user || user.status !== "active") return;

  // Spec: 32 random bytes; only the SHA-256 is stored
  const token = generateToken();
  await db
    .insertInto("password_reset_tokens")
    .values({ user_id: user.id, token_hash: hashToken(token), reset_method: "email_link", expires_at: new Date(Date.now() + RESET_EMAIL_TTL_MS) })
    .execute();
  await enqueueEmail({ template: "reset-password", to: email, link: `${env.APP_ORIGIN}/reset-password?token=${token}` });
}

export async function resetPassword(input: { token: string; newPassword: string }, meta: Meta): Promise<void> {
  assertPassword(input.newPassword);
  const { db } = ctx();
  const passwordHash = await hashPassword(input.newPassword);

  const { userId, email } = await db.transaction().execute(async (trx) => {
    const t = await trx
      .selectFrom("password_reset_tokens as t")
      .innerJoin("users as u", "u.id", "t.user_id")
      .select(["t.id", "t.user_id", "t.reset_method", "u.email", "u.status"])
      .where("t.token_hash", "=", hashToken(input.token))
      .where("t.used_at", "is", null)
      .where("t.expires_at", ">", new Date())
      .forUpdate("t")
      .executeTakeFirst();
    if (!t || t.status !== "active") throw new HttpError(400, "INVALID_OR_EXPIRED_TOKEN");

    // Burn this token and every other outstanding token for the user
    await trx.updateTable("password_reset_tokens").set({ used_at: new Date() }).where("user_id", "=", t.user_id).where("used_at", "is", null).execute();
    await trx
      .updateTable("users")
      .set({
        password_hash: passwordHash,
        password_updated_at: new Date(),
        // Clicking an emailed link proves ownership of the address
        ...(t.reset_method === "email_link" ? { email_verified_at: new Date() } : {}),
      })
      .where("id", "=", t.user_id)
      .execute();
    return { userId: t.user_id, email: t.email };
  });

  // Spec: kick every device out after a password change
  await revokeAllSessions(userId, "password_reset");
  await enqueueEmail({ template: "password-changed", to: email });
  await audit(db, { action: "auth.password_reset", userId, ip: meta.ip, userAgent: meta.userAgent });
}

/** Set or change the password while logged in (Google-only accounts can add one here). */
export async function changePassword(
  user: { id: string; sessionId: string; sessionCreatedAt: Date },
  input: { currentPassword?: string | undefined; newPassword: string },
  meta: Meta,
): Promise<void> {
  assertPassword(input.newPassword);
  const { db } = ctx();
  const row = await db.selectFrom("users").select(["password_hash", "email"]).where("id", "=", user.id).executeTakeFirstOrThrow();

  if (row.password_hash) {
    if (!input.currentPassword || !(await verifyPassword(row.password_hash, input.currentPassword))) {
      throw new HttpError(401, "INVALID_CREDENTIALS");
    }
  } else if (Date.now() - user.sessionCreatedAt.getTime() > 15 * 60_000) {
    // No password yet: require a recent sign-in instead of the current password
    throw new HttpError(403, "REAUTH_REQUIRED");
  }

  await db
    .updateTable("users")
    .set({ password_hash: await hashPassword(input.newPassword), password_updated_at: new Date() })
    .where("id", "=", user.id)
    .execute();
  await revokeAllSessions(user.id, "password_changed", user.sessionId);
  await enqueueEmail({ template: "password-changed", to: row.email });
  await audit(db, { action: "auth.password_reset", userId: user.id, ip: meta.ip, userAgent: meta.userAgent, details: { via: "settings" } });
}

/**
 * Apply the Google sign-in decision from @upskill/core (pre-hijack + email trust rules live there).
 * Returns where to redirect.
 */
export async function applyGoogleSignIn(
  claims: GoogleClaims,
  mode: "login" | "reset",
  meta: Meta,
): Promise<{ redirectTo: string }> {
  const { db } = ctx();

  const linked = await db
    .selectFrom("user_oauth_accounts as o")
    .innerJoin("users as u", "u.id", "o.user_id")
    .select(["u.id", "u.status"])
    .where("o.provider", "=", "google")
    .where("o.provider_user_id", "=", claims.sub)
    .executeTakeFirst();
  const byEmail = linked
    ? null
    : await db.selectFrom("users").select(["id", "email_verified_at", "status"]).where("email", "=", claims.email).executeTakeFirst();

  const decision = decideGoogleSignIn({
    claims,
    linkedUser: linked ? { id: linked.id, status: linked.status as "active" } : null,
    userByEmail: byEmail
      ? { id: byEmail.id, emailVerified: byEmail.email_verified_at !== null, status: byEmail.status as "active" }
      : null,
  });

  let userId: string;
  switch (decision.action) {
    case "REJECT":
      throw new HttpError(403, decision.reason);
    case "LOGIN":
      userId = decision.userId;
      await db.updateTable("user_oauth_accounts").set({ last_used_at: new Date() }).where("provider_user_id", "=", claims.sub).execute();
      break;
    case "LINK_AND_LOGIN":
      userId = decision.userId;
      await db.insertInto("user_oauth_accounts").values({ user_id: userId, provider_user_id: claims.sub, provider_email: claims.email }).execute();
      await audit(db, { action: "auth.google_linked", userId, ip: meta.ip, userAgent: meta.userAgent, details: { auto: true } });
      break;
    case "TAKEOVER_UNVERIFIED_AND_LOGIN":
      userId = decision.userId;
      await db.transaction().execute(async (trx) => {
        // The password was set by whoever registered first; it is not trusted
        await trx.updateTable("users").set({ password_hash: null, password_updated_at: null, email_verified_at: new Date() }).where("id", "=", userId).execute();
        await trx.updateTable("email_verification_tokens").set({ used_at: new Date() }).where("user_id", "=", userId).where("used_at", "is", null).execute();
        await trx.updateTable("password_reset_tokens").set({ used_at: new Date() }).where("user_id", "=", userId).where("used_at", "is", null).execute();
        await trx.insertInto("user_oauth_accounts").values({ user_id: userId, provider_user_id: claims.sub, provider_email: claims.email }).execute();
      });
      await revokeAllSessions(userId, "unverified_takeover");
      await audit(db, { action: "auth.unverified_account_taken_over", userId, ip: meta.ip, userAgent: meta.userAgent });
      break;
    case "CREATE_USER_AND_LOGIN": {
      const created = await db.transaction().execute(async (trx) => {
        const u = await trx.insertInto("users").values({ email: claims.email, email_verified_at: new Date() }).returning("id").executeTakeFirstOrThrow();
        await trx.insertInto("user_oauth_accounts").values({ user_id: u.id, provider_user_id: claims.sub, provider_email: claims.email }).execute();
        return u;
      });
      userId = created.id;
      break;
    }
  }

  await createSession(userId, meta);
  await audit(db, { action: "auth.login", userId, ip: meta.ip, userAgent: meta.userAgent, details: { method: "google", decision: decision.action } });

  // Reset via Google (spec 5.1 #2, method 1): only for an account that was already linked to this Google sub
  if (mode === "reset" && (decision.action === "LOGIN" || decision.action === "LINK_AND_LOGIN")) {
    const token = generateToken();
    await db
      .insertInto("password_reset_tokens")
      .values({ user_id: userId, token_hash: hashToken(token), reset_method: "google_reauth", expires_at: new Date(Date.now() + RESET_GOOGLE_TTL_MS) })
      .execute();
    return { redirectTo: `/reset-password?token=${token}` };
  }
  return { redirectTo: "/" };
}

/** Link Google to the logged-in account from the settings page */
export async function linkGoogleToUser(userId: string, claims: GoogleClaims, meta: Meta): Promise<void> {
  const { db } = ctx();
  const owner = await db
    .selectFrom("user_oauth_accounts")
    .select("user_id")
    .where("provider", "=", "google")
    .where("provider_user_id", "=", claims.sub)
    .executeTakeFirst();
  if (owner && owner.user_id !== userId) throw new HttpError(409, "GOOGLE_ACCOUNT_IN_USE");
  if (owner) return;
  try {
    await db.insertInto("user_oauth_accounts").values({ user_id: userId, provider_user_id: claims.sub, provider_email: claims.email }).execute();
  } catch (err) {
    if (pgErrorCode(err) === PG.UNIQUE_VIOLATION) throw new HttpError(409, "ALREADY_LINKED");
    throw err;
  }
  await audit(db, { action: "auth.google_linked", userId, ip: meta.ip, userAgent: meta.userAgent, details: { auto: false } });
}

const NAME_RE = /^[\p{Script=Thai}\p{Script=Latin}\p{M}][\p{Script=Thai}\p{Script=Latin}\p{M} .'-]{1,119}$/u;

/** Spec 5.4 #1: after this, the DB trigger makes the name immutable */
export async function lockLegalName(userId: string, input: { nameTh?: string | undefined; nameEn?: string | undefined }, meta: Meta) {
  const th = input.nameTh ? normalizeName(input.nameTh) : null;
  const en = input.nameEn ? normalizeName(input.nameEn) : null;
  if (!th && !en) throw new HttpError(400, "NAME_REQUIRED");
  for (const n of [th, en]) if (n && !NAME_RE.test(n)) throw new HttpError(400, "INVALID_NAME");

  const { db } = ctx();
  const res = await db
    .updateTable("users")
    .set({ legal_full_name_th: th, legal_full_name_en: en, legal_name_locked_at: new Date() })
    .where("id", "=", userId)
    .where("legal_name_locked_at", "is", null)
    .executeTakeFirst();
  if (Number(res.numUpdatedRows) === 0) throw new HttpError(409, "LEGAL_NAME_ALREADY_LOCKED");
  await audit(db, { action: "user.legal_name_locked", userId, ip: meta.ip, userAgent: meta.userAgent });
}
