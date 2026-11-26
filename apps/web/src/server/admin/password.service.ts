import { maskEmail } from "@/lib/mask-email";
import { requireOutboundEmail } from "@/server/admin/email-settings.service";
/**
 * Admin password tools for a live system: every way a member can get back into their account when
 * self-service ("ลืมรหัสผ่าน") is not enough. Rules shared by all actions:
 *  - never on the protected system owner, never on the admin's own account, only on active accounts
 *  - the admin never learns the user's chosen password; temporary passwords must be replaced at next login
 *  - every action is audited against the admin
 */
import "server-only";
import { randomInt } from "node:crypto";
import { generateToken, hashToken } from "@upskill/core";
import { hashPassword, validatePasswordPolicy } from "@upskill/infra/password";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { ctx } from "../context";
import { audit } from "../audit";
import { HttpError } from "../http";
import { addEmailToOutbox } from "../email/outbox.service";
import { revokeAllSessions } from "../auth/session";
import { emailKey } from "../rate-keys";

const EMAIL_LINK_TTL_MS = 60 * 60_000; // admin-sent email: 1 hour, same as self-service (the email text says so)
const ADMIN_LINK_TTL_MS = 24 * 60 * 60_000; // link handed over by the admin: 24 hours, single use

type Meta = { ip: string };

async function loadTarget(adminId: string, userId: string) {
  const user = await ctx()
    .db.selectFrom("users")
    .select(["id", "email", "username", "status", "is_system_owner", "email_verified_at"])
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!user) throw new HttpError(404, "NOT_FOUND");
  if (user.is_system_owner) throw new HttpError(409, "SYSTEM_OWNER_PROTECTED");
  if (user.id === adminId) throw new HttpError(409, "FORBIDDEN", "จัดการรหัสผ่านของบัญชีตัวเองได้ที่หน้าความปลอดภัยของบัญชี");
  if (user.status !== "active") throw new HttpError(409, "USER_NOT_ACTIVE", "เปิดใช้งานบัญชีก่อน จึงจะรีเซ็ตรหัสผ่านได้");
  const assigned = await ctx().db.selectFrom("recovery_staff").select("duty").where("user_id","=",adminId).executeTakeFirst();
  if (assigned?.duty === "auditor") throw new HttpError(403,"FORBIDDEN");
  return user;
}

async function requireDirectHandover(actor: string, target: string) {
  const {db} = ctx();
  const [delegated, pending] = await Promise.all([
    db.selectFrom("recovery_staff").select("duty").where("user_id","=",actor).executeTakeFirst(),
    db.selectFrom("recovery_cases").select("id").where("target_user_id","=",target).where("status","in",["approval","approved","issued"]).executeTakeFirst(),
  ]);
  if (pending || delegated) throw new HttpError(409,"CASE_REQUIRED","กรุณาดำเนินการผ่านเรื่องขอกู้บัญชี");
}

/** Email the user a reset link. `logout` also signs them out everywhere right away. */
export async function adminSendResetEmail(adminId: string, userId: string, opts: { logout: boolean }, meta: Meta) {
  const { db, env } = ctx();
  const user = await loadTarget(adminId, userId);
  await requireOutboundEmail();
  if (user.email.endsWith(".invalid")) throw new HttpError(409, "NO_EMAIL", "บัญชีนี้ไม่มีอีเมลที่ส่งได้ ใช้การสร้างลิงก์หรือรหัสผ่านชั่วคราวแทน");
  const token = generateToken();
  const expiresAt = new Date(Date.now() + EMAIL_LINK_TTL_MS);
  await db.transaction().execute(async (trx) => {
    const reset = await trx
      .insertInto("password_reset_tokens")
      .values({ user_id: user.id, recipient_email: user.email, token_hash: hashToken(token), reset_method: "email_link", expires_at: expiresAt })
      .returning("id")
      .executeTakeFirstOrThrow();
    await addEmailToOutbox(
      trx,
      { template: "reset-password", to: user.email, link: `${env.APP_ORIGIN}/reset-password?token=${token}` },
      { userId: user.id, deduplicationKey: `reset-password:${reset.id}` },
    );
  });
  if (opts.logout) await revokeAllSessions(user.id, "admin_password_reset");
  await audit(db, { action: "auth.password_reset", userId: adminId, entityType: "user", entityId: user.id, ip: meta.ip, details: { forcedByAdmin: true, via: "email", logout: opts.logout } });
  return { sentTo: maskEmail(user.email), expiresAt: expiresAt.toISOString() };
}

/** A single-use reset link the admin hands over (chat, phone, in person) when email does not reach the user. */
export async function adminCreateResetLink(adminId: string, userId: string, meta: Meta) {
  const { db, env } = ctx();
  const user = await loadTarget(adminId, userId);
  const token = generateToken();
  await requireDirectHandover(adminId,userId);
  const expiresAt = new Date(Date.now() + ADMIN_LINK_TTL_MS);
  await db
    .insertInto("password_reset_tokens")
    .values({ user_id: user.id, token_hash: hashToken(token), reset_method: "admin_link", expires_at: expiresAt })
    .execute();
  await audit(db, { action: "auth.password_reset_link_created", userId: adminId, entityType: "user", entityId: user.id, ip: meta.ip });
  return { link: `${env.APP_ORIGIN}/reset-password?token=${token}`, expiresAt: expiresAt.toISOString() };
}

// No look-alike characters (0/O, 1/l/I) so it can be read out over the phone
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function generateTemporaryPassword(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}

/**
 * Set a temporary password the admin gives to the user. The user is signed out everywhere and, at their next
 * login, must choose their own password before any session is created (users.must_change_password).
 */
export async function adminSetTemporaryPassword(
  adminId: string,
  userId: string,
  input: { password?: string | undefined; verifyEmail: boolean },
  meta: Meta,
) {
  const { db } = ctx();
  const user = await loadTarget(adminId, userId);
  await requireDirectHandover(adminId,userId);
  if (input.verifyEmail) throw new HttpError(409,"EMAIL_PROOF_REQUIRED","เจ้าของอีเมลต้องยืนยันด้วยตนเอง");
  const password = input.password?.trim() || generateTemporaryPassword();
  const problem = validatePasswordPolicy(password);
  if (problem) throw new HttpError(400, "WEAK_PASSWORD", problem);
  const passwordHash = await hashPassword(password);
  const now = new Date();
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("password_reset_tokens").set({ used_at: now }).where("user_id", "=", user.id).where("used_at", "is", null).execute();
    await trx
      .updateTable("users")
      .set({
        password_hash: passwordHash,
        password_updated_at: now,
        must_change_password: true,
      })
      .where("id", "=", user.id)
      .execute();
    if (!user.email.endsWith(".invalid")) {
      await addEmailToOutbox(trx, { template: "password-changed", to: user.email }, { userId: user.id, deduplicationKey: `password-changed:admin:${user.id}:${now.toISOString()}` });
    }
  });
  await revokeAllSessions(user.id, "admin_temporary_password");
  await clearLoginLimits(user);
  await audit(db, {
    action: "auth.temporary_password_set",
    userId: adminId,
    entityType: "user",
    entityId: user.id,
    ip: meta.ip,
    details: { generated: !input.password?.trim(), verifiedEmail: false },
  });
  return { password, loginId: user.username ?? user.email };
}

async function clearLoginLimits(user: { id: string; email: string; username: string | null }) {
  const { db, redis } = ctx();
  const extra = await db.selectFrom("user_emails").select("email").where("user_id", "=", user.id).execute();
  const ids = new Set([user.email, ...(user.username ? [user.username] : []), ...extra.map((e) => e.email)]);
  const keys = [...ids].flatMap((id) => [RATE_LIMITS.loginPerAccount, RATE_LIMITS.forgotPasswordPerAccount].map((r) => `rl:${r.name}:${emailKey(id)}`));
  if (keys.length) await redis.del(...keys);
  return keys.length;
}

/** Clear the per-account login / forgot-password throttles after too many failed attempts. */
export async function adminUnlockLogin(adminId: string, userId: string, meta: Meta) {
  const user = await loadTarget(adminId, userId);
  await clearLoginLimits(user);
  await audit(ctx().db, { action: "auth.login_unlocked", userId: adminId, entityType: "user", entityId: user.id, ip: meta.ip });
  return { ok: true };
}

/** Recent reset activity for the admin user page (never the token itself). */
export async function listPasswordResets(userId: string) {
  return ctx()
    .db.selectFrom("password_reset_tokens")
    .select(["id", "reset_method", "created_at", "expires_at", "used_at"])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .limit(10)
    .execute();
}
