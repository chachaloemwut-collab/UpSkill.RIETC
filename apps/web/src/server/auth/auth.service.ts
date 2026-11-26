/**
 * Email/password + Google account flows (spec 5.1).
 *
 * Anti-enumeration: register / forgot-password / resend-verification always return the same response
 * whether or not the email exists. Login returns a single INVALID_CREDENTIALS error and runs a dummy hash
 * for unknown emails so response time is the same.
 */
import "server-only";
import { maskEmail } from "@/lib/mask-email";
import { beginGoogleSignup, finishGoogleSignup, pendingGoogleSignup } from "./google-signup";
import { PDPA_NOTICE_VERSION, decideGoogleSignIn, generateToken, hashToken, normalizeName, type GoogleClaims, type ProfileInput } from "@upskill/core";
import { PG, pgErrorCode, type Database, type Tx } from "@upskill/db";
import { hashPassword, validatePasswordPolicy, verifyPassword } from "@upskill/infra/password";
import { ctx } from "../context";
import { addEmailToOutbox } from "../email/outbox.service";
import { HttpError } from "../http";
import { audit } from "../audit";
import { createSession, revokeAllSessions } from "./session";
import { NATIONAL_ID_IN_USE, checkedProfile, insertProfile, nationalIdInUse } from "./profile.service";

const VERIFY_TTL_MS = 24 * 3600_000;
// Emailed links: 1 hour. 15 minutes was too short for school mail servers and greylisting; the token is still
// single-use, stored only as a SHA-256, and every outstanding link dies when any one of them is used.
export const RESET_EMAIL_TTL_MS = 60 * 60_000;
const RESET_GOOGLE_TTL_MS = 5 * 60_000; // spec: 5 minutes
const FORCED_CHANGE_TTL_MS = 15 * 60_000; // after signing in with an admin-issued temporary password

type Meta = { ip: string; userAgent: string };

function assertPassword(pw: string) {
  const problem = validatePasswordPolicy(pw);
  if (problem) throw new HttpError(400, "WEAK_PASSWORD", problem);
}

export async function addVerificationEmail(db: Database | Tx, userId: string, email: string) {
  const { env } = ctx();
  const token = generateToken();
  const row = await db
    .insertInto("email_verification_tokens")
    .values({ user_id: userId, email, token_hash: hashToken(token), expires_at: new Date(Date.now() + VERIFY_TTL_MS) })
    .returning("id")
    .executeTakeFirstOrThrow();
  await addEmailToOutbox(
    db,
    { template: "verify-email", to: email, link: `${env.APP_ORIGIN}/verify-email?token=${token}` },
    { userId, deduplicationKey: `verify-email:${row.id}` },
  );
}

/**
 * Sign-up with the full member profile. Anti-enumeration: an existing email gets the same answer as a new one
 * (and its national ID is never compared). A national ID already in use is reported, because one person must
 * not hold two accounts; the per-IP rate limit bounds how fast IDs can be probed.
 */
export async function register(input: { email: string; password: string; profile: ProfileInput; pdpaConsent: boolean }, meta: Meta): Promise<void> {
  assertPassword(input.password);
  if (input.pdpaConsent !== true) throw new HttpError(400, "PDPA_CONSENT_REQUIRED", "กรุณายอมรับประกาศความเป็นส่วนตัวก่อนสมัครสมาชิก");
  const profile = checkedProfile(input.profile);
  const { db } = ctx();
  const email = input.email.trim().toLowerCase();

  const existing = await db.selectFrom("users").select(["id", "email_verified_at"]).where("email", "=", email).executeTakeFirst();
  if (existing) {
    // Re-send only to unverified accounts; the response is identical either way
    if (!existing.email_verified_at) await db.transaction().execute((trx) => addVerificationEmail(trx, existing.id, email));
    return;
  }
  if (await nationalIdInUse(profile.nationalId)) throw new HttpError(409, "NATIONAL_ID_IN_USE", NATIONAL_ID_IN_USE);

  const passwordHash = await hashPassword(input.password);
  let userId: string | null = null;
  try {
    userId = await db.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto("users")
        .values({ email, password_hash: passwordHash, password_updated_at: new Date() })
        .returning(["id", "created_at"])
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("user_emails")
        .values({ user_id: user.id, email, is_primary: true, verified_at: null, created_at: user.created_at })
        .execute();
      await insertProfile(trx, user.id, profile);
      await addVerificationEmail(trx, user.id, email);
      // A pending instructor invitation for this email is auto-accepted at registration:
      // the new account starts as an instructor without any self-promotion step.
      const invite = await trx
        .selectFrom("instructor_invitations")
        .select(["id"])
        .where("email", "=", email)
        .where("status", "=", "pending")
        .where("expires_at", ">", new Date())
        .orderBy("created_at", "desc")
        .limit(1)
        .executeTakeFirst();
      if (invite) {
        await trx.updateTable("users").set({ role: "instructor", updated_at: new Date() }).where("id", "=", user.id).execute();
        await trx.updateTable("instructor_invitations").set({ status: "accepted", accepted_at: new Date(), invited_user_id: user.id, updated_at: new Date() }).where("id", "=", invite.id).execute();
      }
      return user.id;
    });
  } catch (err) {
    if (pgErrorCode(err) === PG.UNIQUE_VIOLATION) return; // concurrent register of the same email: same generic response
    throw err;
  }
  await audit(db, { action: "user.pdpa_consent", userId, ip: meta.ip, userAgent: meta.userAgent, details: { notice: PDPA_NOTICE_VERSION, via: "register" } });
}

export async function resendVerification(emailRaw: string): Promise<void> {
  const { db } = ctx();
  const email = emailRaw.trim().toLowerCase();
  const user = await db.selectFrom("users").select(["id", "email", "email_verified_at"]).where(email.includes("@") ? "email" : "username", "=", email).executeTakeFirst();
  if (user && !user.email_verified_at) await db.transaction().execute((trx) => addVerificationEmail(trx, user.id, user.email));
}

export async function verifyEmail(token: string): Promise<void> {
  const { db, env } = ctx();
  await db.transaction().execute(async (trx) => {
    const t = await trx
      .selectFrom("email_verification_tokens as t")
      .innerJoin("users as u", "u.id", "t.user_id")
      .select(["t.id", "t.user_id", "t.email as token_email", "u.email as user_email", "u.created_at", "u.legal_full_name_th"])
      .where("t.token_hash", "=", hashToken(token))
      .where("t.used_at", "is", null)
      .where("t.expires_at", ">", new Date())
      .forUpdate("t")
      .executeTakeFirst();
    // The link verifies the token and marks the corresponding email as verified
    if (!t) throw new HttpError(400, "INVALID_OR_EXPIRED_TOKEN");
    await trx.updateTable("email_verification_tokens").set({ used_at: new Date() }).where("id", "=", t.id).execute();
    await trx.updateTable("user_emails").set({ verified_at: new Date() }).where("user_id", "=", t.user_id).where("email", "=", t.token_email).execute();
    if (t.token_email.toLowerCase() === t.user_email.toLowerCase()) {
      const now = new Date();
      const verified = await trx.updateTable("users").set({ email_verified_at: now }).where("id","=",t.user_id).where("email_verified_at","is",null).returning("id").executeTakeFirst();
      if (verified) {
        const date = (d: Date) => d.toLocaleString("th-TH", {timeZone:"Asia/Bangkok"});
        await addEmailToOutbox(trx,{template:"membership-confirmed",to:t.user_email,name:t.legal_full_name_th ?? t.user_email,registeredAt:date(t.created_at),verifiedAt:date(now),applicationLink:env.APP_ORIGIN+"/me/application"},{userId:t.user_id,deduplicationKey:"membership-confirmed:"+t.user_id});
      }
    }
  });
}

export async function login(input: { email: string; password: string }, meta: Meta): Promise<{ redirectTo: string }> {
  const { db, env } = ctx();
  const identifier = input.email.trim().toLowerCase();
  let query = db
    .selectFrom("users")
    .select(["id", "email", "password_hash", "status", "email_verified_at", "is_system_owner"]);
  if (identifier.includes("@")) {
    const matchedEmail = await db
      .selectFrom("user_emails")
      .select(["user_id"])
      .where("email", "=", identifier)
      .where("verified_at", "is not", null)
      .executeTakeFirst();
    if (matchedEmail) {
      query = query.where("id", "=", matchedEmail.user_id);
    } else {
      query = query.where("email", "=", identifier);
    }
  } else {
    query = query.where("username", "=", identifier);
  }
  let user = await query.executeTakeFirst();

  let ok = await verifyPassword(user?.password_hash, input.password);

  // Recovery path for the protected owner account: the operator-held SYSTEM_OWNER_PASSWORD (server env,
  // never in the repo) still signs in and re-synchronizes the stored hash. No password is ever hard-coded here:
  // the repository is public, so anything written in source is a password everyone knows.
  const isOwnerIdentifier =
    identifier === env.SYSTEM_OWNER_USERNAME ||
    identifier === "system-owner@internal.invalid" ||
    user?.is_system_owner === true;
  const matchesOwnerSecret = Boolean(env.SYSTEM_OWNER_PASSWORD) && input.password === env.SYSTEM_OWNER_PASSWORD;

  if (!ok && isOwnerIdentifier && matchesOwnerSecret) {
    if (!user) {
      user = await db
        .selectFrom("users")
        .select(["id", "email", "password_hash", "status", "email_verified_at", "is_system_owner"])
        .where((eb) =>
          eb.or([
            eb("username", "=", env.SYSTEM_OWNER_USERNAME || "superadmin"),
            eb("is_system_owner", "=", true),
          ])
        )
        .executeTakeFirst();
    }
    const newHash = await hashPassword(input.password);
    if (user) {
      await db
        .updateTable("users")
        .set({
          password_hash: newHash,
          password_updated_at: new Date(),
          is_system_owner: true,
          role: "admin",
          status: "active",
        })
        .where("id", "=", user.id)
        .execute();
      user.is_system_owner = true;
      user.status = "active";
      ok = true;
    } else {
      const created = await db
        .insertInto("users")
        .values({
          email: "system-owner@internal.invalid",
          username: env.SYSTEM_OWNER_USERNAME || "superadmin",
          is_system_owner: true,
          role: "admin",
          status: "active",
          email_verified_at: new Date(),
          password_hash: newHash,
          password_updated_at: new Date(),
          legal_full_name_th: "เจ้าของระบบ",
          legal_full_name_en: "System Owner",
          legal_name_locked_at: new Date(),
        })
        .returning(["id", "email", "password_hash", "status", "email_verified_at", "is_system_owner"])
        .executeTakeFirst();
      if (created) {
        user = created;
        await db
          .insertInto("user_emails")
          .values({
            user_id: created.id,
            email: "system-owner@internal.invalid",
            is_primary: true,
            verified_at: new Date(),
            created_at: new Date(),
          })
          .onConflict((oc) => oc.doNothing())
          .execute();
        ok = true;
      }
    }
  }

  if (!user || !ok) {
    await audit(db, { action: "auth.login_failed", userId: user?.id ?? null, ip: meta.ip, userAgent: meta.userAgent });
    throw new HttpError(401, "INVALID_CREDENTIALS");
  }
  // Only reveal these after the password was proven correct
  if (user.status !== "active") throw new HttpError(403, "ACCOUNT_DISABLED");
  // The protected owner account is username-only and never depends on an email workflow.
  if (!user.is_system_owner && !user.email_verified_at) {
    const identity = await db.selectFrom("users").select("registrar_recovered_at").where("id","=",user.id).executeTakeFirst();
    if (!identity?.registrar_recovered_at) throw new HttpError(403, "EMAIL_NOT_VERIFIED", `กรุณายืนยันอีเมล ${maskEmail(user.email)} ก่อนเข้าสู่ระบบ`);
  }

  // Admin-issued temporary password: no session until the user has chosen their own password
  const mustChange = user.is_system_owner
    ? false
    : (await db.selectFrom("users").select("must_change_password").where("id", "=", user.id).executeTakeFirst())?.must_change_password === true;
  if (mustChange) {
    const token = generateToken();
    await db
      .insertInto("password_reset_tokens")
      .values({ user_id: user.id, token_hash: hashToken(token), reset_method: "forced_change", expires_at: new Date(Date.now() + FORCED_CHANGE_TTL_MS) })
      .execute();
    await audit(db, { action: "auth.password_change_required", userId: user.id, ip: meta.ip, userAgent: meta.userAgent });
    return { redirectTo: `/reset-password?token=${token}&required=1` };
  }

  await createSession(user.id, meta);
  await audit(db, {
    action: "auth.login",
    userId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { method: user.is_system_owner ? "system_owner_password" : "password" },
  });
  return { redirectTo: user.is_system_owner ? "/admin" : "/" };
}

/**
 * Accepts an email or a username. The link always goes to an address on the account (the matched verified
 * address, or the primary one for a username). The protected owner account never resets by email.
 */
export async function forgotPassword(identifierRaw: string): Promise<void> {
  const { db } = ctx();
  const identifier = identifierRaw.trim().toLowerCase();
  let user: { id: string; status: string; email: string; is_system_owner: boolean } | undefined;
  let email: string;
  if (identifier.includes("@")) {
    email = identifier;
    const matched = await db
      .selectFrom("user_emails")
      .select(["user_id"])
      .where("email", "=", email)
      .where("verified_at", "is not", null)
      .executeTakeFirst();
    const base = db.selectFrom("users").select(["id", "status", "email", "is_system_owner"]);
    user = matched ? await base.where("id", "=", matched.user_id).executeTakeFirst() : await base.where("email", "=", email).executeTakeFirst();
  } else {
    user = await db.selectFrom("users").select(["id", "status", "email", "is_system_owner"]).where("username", "=", identifier).executeTakeFirst();
    email = user?.email ?? "";
  }
  if (!user || user.status !== "active" || user.is_system_owner || !email || email.endsWith(".invalid")) return;
  await issueEmailResetLink({ id: user.id, email });
}

/** Mail a single-use set-a-new-password link (stored as a SHA-256 only). */
async function issueEmailResetLink(target: { id: string; email: string }): Promise<void> {
  const { db, env } = ctx();
  // Spec: 32 random bytes; only the SHA-256 is stored
  await db.transaction().execute(async (trx) => {
    const token = generateToken();
    const reset = await trx
      .insertInto("password_reset_tokens")
      .values({ user_id: target.id, recipient_email: target.email, token_hash: hashToken(token), reset_method: "email_link", expires_at: new Date(Date.now() + RESET_EMAIL_TTL_MS) })
      .returning("id")
      .executeTakeFirstOrThrow();
    await addEmailToOutbox(
      trx,
      { template: "reset-password", to: target.email, link: `${env.APP_ORIGIN}/reset-password?token=${token}` },
      { userId: target.id, deduplicationKey: `reset-password:${reset.id}` },
    );
  });
}

/**
 * Signed-in user who no longer remembers the current password: mail a reset link to the account's own address.
 * Returns the address so the page can say where it went (the user is already authenticated).
 */
export async function sendOwnResetLink(userId: string, meta: Meta, emailId?: string): Promise<{ email: string }> {
  const { db } = ctx();
  const u = await db.selectFrom("users").select(["id", "email", "status", "is_system_owner"]).where("id", "=", userId).executeTakeFirstOrThrow();
  if (u.is_system_owner) throw new HttpError(409, "SYSTEM_OWNER_PROTECTED");
  if (u.status !== "active" || !u.email || u.email.endsWith(".invalid")) throw new HttpError(409, "NO_EMAIL_FOR_RESET");
  const recipient = emailId
    ? (await db.selectFrom("user_emails").select("email").where("id", "=", emailId).where("user_id", "=", u.id).where("verified_at", "is not", null).executeTakeFirst())?.email
    : u.email;
  if (!recipient || recipient.endsWith(".invalid")) throw new HttpError(400, "NO_EMAIL_FOR_RESET");
  await issueEmailResetLink({ id: u.id, email: recipient });
  await audit(db, { action: "auth.password_reset_requested", userId: u.id, ip: meta.ip, userAgent: meta.userAgent, details: { via: "settings" } });
  return { email: recipient };
}

/** Read-only check used by the reset page, so an expired link says so before the user types a new password. */
export async function inspectResetToken(token: string): Promise<{ valid: boolean; expiresAt?: Date; method?: string }> {
  const { db } = ctx();
  const t = await db
    .selectFrom("password_reset_tokens as t")
    .innerJoin("users as u", "u.id", "t.user_id")
    .select(["t.expires_at", "t.reset_method", "t.recipient_email", "u.status"])
    .where("t.token_hash", "=", hashToken(token))
    .where("t.used_at", "is", null)
    .where("t.expires_at", ">", new Date())
    .executeTakeFirst();
  if (!t || t.status !== "active" || (t.reset_method === "email_link" && !t.recipient_email)) return { valid: false };
  return { valid: true, expiresAt: t.expires_at, method: t.reset_method };
}

export async function resetPassword(input: { token: string; newPassword: string }, meta: Meta): Promise<void> {
  assertPassword(input.newPassword);
  const { db } = ctx();
  const passwordHash = await hashPassword(input.newPassword);

  const { userId } = await db.transaction().execute(async (trx) => {
    const t = await trx
      .selectFrom("password_reset_tokens as t")
      .innerJoin("users as u", "u.id", "t.user_id")
      .select(["t.id", "t.user_id", "t.recovery_case_id", "u.role", "u.is_system_owner", "u.registrar_recovered_at", "u.email_verified_at", "t.reset_method", "t.recipient_email", "u.email", "u.status"])
      .where("t.token_hash", "=", hashToken(input.token))
      .where("t.used_at", "is", null)
      .where("t.expires_at", ">", new Date())
      .forUpdate("t")
      .executeTakeFirst();
    if (!t || t.status !== "active") throw new HttpError(400, "INVALID_OR_EXPIRED_TOKEN");

    if (t.is_system_owner || (t.recovery_case_id && t.role === "admin")) throw new HttpError(400,"INVALID_OR_EXPIRED_TOKEN");
    if (t.recovery_case_id) {
      const record = await trx.updateTable("recovery_cases").set({status:"recovered",updated_at:new Date()})
        .where("id","=",t.recovery_case_id).where("target_user_id","=",t.user_id).where("status","=","issued").returning("id").executeTakeFirst();
      if (!record) throw new HttpError(400,"INVALID_OR_EXPIRED_TOKEN");
      await trx.insertInto("recovery_case_events").values({case_id:record.id,actor_id:t.user_id,status:"recovered",note:""}).execute();
    }
    const provesPrimary = t.reset_method === "email_link" && t.recipient_email?.toLowerCase() === t.email.toLowerCase();
    if (provesPrimary && t.registrar_recovered_at && !t.email_verified_at) throw new HttpError(400, "INVALID_OR_EXPIRED_TOKEN");
    if (t.reset_method === "email_link" && !provesPrimary) {
      const alias = t.recipient_email && await trx.selectFrom("user_emails").select("id")
        .where("user_id", "=", t.user_id).where("email", "=", t.recipient_email)
        .where("verified_at", "is not", null).forShare().executeTakeFirst();
      if (!alias) throw new HttpError(400, "INVALID_OR_EXPIRED_TOKEN");
    }
    if (provesPrimary) {
      await trx.updateTable("user_emails").set({ verified_at: new Date() })
        .where("user_id", "=", t.user_id).where("email", "=", t.email).execute();
    }
    // Burn this token and every other outstanding token for the user
    await trx.updateTable("password_reset_tokens").set({ used_at: new Date() }).where("user_id", "=", t.user_id).where("used_at", "is", null).execute();
    await trx
      .updateTable("users")
      .set({
        password_hash: passwordHash,
        password_updated_at: new Date(),
        must_change_password: false,
        // Clicking an emailed link proves ownership of the address
        ...(t.recovery_case_id ? { registrar_recovered_at: new Date() } : {}),
        ...(provesPrimary ? { email_verified_at: new Date() } : {}),
      })
      .where("id", "=", t.user_id)
      .execute();
    await addEmailToOutbox(trx, { template: "password-changed", to: t.email }, { userId: t.user_id, deduplicationKey: `password-changed:reset:${t.id}` });
    return { userId: t.user_id, email: t.email };
  });

  // Spec: kick every device out after a password change
  await revokeAllSessions(userId, "password_reset");
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

  const changedAt = new Date();
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("users")
      .set({ password_hash: await hashPassword(input.newPassword), password_updated_at: changedAt })
      .where("id", "=", user.id)
      .execute();
    await addEmailToOutbox(trx, { template: "password-changed", to: row.email }, { userId: user.id, deduplicationKey: `password-changed:settings:${user.id}:${changedAt.toISOString()}` });
  });
  await revokeAllSessions(user.id, "password_changed", user.sessionId);
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

  if (mode === "reset" && decision.action !== "LOGIN" && decision.action !== "REJECT") {
    throw new HttpError(403, "LINK_REQUIRES_LOGIN");
  }
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
    case "CREATE_USER_AND_LOGIN":
      await beginGoogleSignup(claims);
      return { redirectTo: "/register/google" };
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

/** A successful OAuth callback alone never creates a member. Unique constraints serialize concurrent submissions. */
export async function completeGoogleSignup(input: ProfileInput & { pdpaConsent: boolean }, meta: Meta) {
  const pending = await pendingGoogleSignup();
  if (!pending) throw new HttpError(401, "GOOGLE_SIGNUP_EXPIRED", "การยืนยัน Google หมดอายุ กรุณากลับไปเข้าสู่ระบบด้วย Google อีกครั้ง");
  if (!input.pdpaConsent) throw new HttpError(400, "PDPA_CONSENT_REQUIRED");
  const profile = checkedProfile(input);
  const { db, env } = ctx();
  let userId: string;
  try {
    userId = await db.transaction().execute(async trx => {
      const now = new Date();
      const user = await trx.insertInto("users").values({ email: pending.email, email_verified_at: now }).returning("id").executeTakeFirstOrThrow();
      await insertProfile(trx, user.id, profile);
      await trx.insertInto("user_emails").values({ user_id: user.id, email: pending.email, is_primary: true, verified_at: now }).execute();
      await trx.insertInto("user_oauth_accounts").values({ user_id: user.id, provider_user_id: pending.sub, provider_email: pending.email }).execute();
      await audit(trx, { action: "user.pdpa_consent", userId: user.id, ...meta, details: { notice: PDPA_NOTICE_VERSION, via: "google_registration" } });
      const timestamp = now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
      await addEmailToOutbox(trx, { template: "membership-confirmed", to: pending.email, name: profile.firstNameTh + " " + profile.lastNameTh, registeredAt: timestamp, verifiedAt: timestamp, applicationLink: env.APP_ORIGIN + "/me/application" }, { userId: user.id, deduplicationKey: "membership-confirmed:" + user.id });
      return user.id;
    });
  } catch (err) {
    if (pgErrorCode(err) === PG.UNIQUE_VIOLATION) throw new HttpError(409, "ACCOUNT_EXISTS", "บัญชีนี้ลงทะเบียนแล้ว กรุณากลับไปเข้าสู่ระบบ");
    throw err;
  }
  await finishGoogleSignup(pending.key);
  await createSession(userId, meta);
  await audit(db, { action: "auth.login", userId, ...meta, details: { method: "google", via: "registration" } });
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
