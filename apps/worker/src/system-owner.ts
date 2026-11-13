import type { Database } from "@upskill/db";
import type { Env } from "@upskill/infra/env";
import { hashPassword, verifyPassword } from "@upskill/infra/password";
import { logger } from "@upskill/infra/logger";

const INTERNAL_OWNER_EMAIL = "system-owner@internal.invalid";

/**
 * Creates the one protected owner account when its bootstrap password is set.
 * The deployment secret is the source of truth for this username-only account.
 */
export async function ensureSystemOwner(db: Database, env: Env): Promise<void> {
  if (!env.SYSTEM_OWNER_PASSWORD) {
    logger.warn("SYSTEM_OWNER_PASSWORD is not set; system owner bootstrap was skipped");
    return;
  }

  const owner = await db.selectFrom("users").select(["id", "username", "is_system_owner", "password_hash"]).where("is_system_owner", "=", true).executeTakeFirst();
  if (owner) {
    if (owner.username !== env.SYSTEM_OWNER_USERNAME) throw new Error("Configured system owner username does not match the protected account");
    if (!(await verifyPassword(owner.password_hash, env.SYSTEM_OWNER_PASSWORD))) {
      await db.transaction().execute(async (trx) => {
        await trx.updateTable("users").set({ password_hash: await hashPassword(env.SYSTEM_OWNER_PASSWORD!), password_updated_at: new Date() }).where("id", "=", owner.id).execute();
        await trx.updateTable("user_sessions").set({ revoked_at: new Date(), revoked_reason: "system_owner_secret_rotated" }).where("user_id", "=", owner.id).where("revoked_at", "is", null).execute();
      });
      logger.info("protected system owner password was synchronized from deployment secrets");
    }
    return;
  }

  const conflict = await db.selectFrom("users").select(["id", "is_system_owner"]).where("username", "=", env.SYSTEM_OWNER_USERNAME).executeTakeFirst();
  if (conflict) throw new Error("SYSTEM_OWNER_USERNAME is already used by a non-owner account");

  await db
    .insertInto("users")
    .values({
      email: INTERNAL_OWNER_EMAIL,
      username: env.SYSTEM_OWNER_USERNAME,
      is_system_owner: true,
      role: "admin",
      status: "active",
      email_verified_at: new Date(),
      password_hash: await hashPassword(env.SYSTEM_OWNER_PASSWORD),
      password_updated_at: new Date(),
      legal_full_name_th: "เจ้าของระบบ",
      legal_full_name_en: "System Owner",
      legal_name_locked_at: new Date(),
    })
    .execute();
  logger.info("protected system owner account was bootstrapped");
}
