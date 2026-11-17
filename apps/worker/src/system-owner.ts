import type { Database } from "@upskill/db";
import type { Env } from "@upskill/infra/env";
import { hashPassword, verifyPassword } from "@upskill/infra/password";
import { logger } from "@upskill/infra/logger";

const INTERNAL_OWNER_EMAIL = "system-owner@internal.invalid";

/**
 * Bootstraps the one protected owner account — CREATE-ONLY.
 *
 * Production rule (docs/AI_COLLABORATION.md): the deployment secret is used to create the
 * account ONLY when no owner exists yet. An existing owner — or any user that already holds
 * the configured username — is never modified: no password-hash overwrite, no role/status
 * change, no session revocation. Password rotation of existing accounts is a separate task
 * requested explicitly by the user, never a startup side effect.
 */
export async function ensureSystemOwner(db: Database, env: Env): Promise<void> {
  if (!env.SYSTEM_OWNER_PASSWORD) {
    logger.warn("SYSTEM_OWNER_PASSWORD is not set; system owner bootstrap was skipped");
    return;
  }

  const owner = await db.selectFrom("users").select(["id", "username", "password_hash"]).where("is_system_owner", "=", true).executeTakeFirst();
  if (owner) {
    if (owner.username !== env.SYSTEM_OWNER_USERNAME) {
      logger.warn(
        { configuredUsername: env.SYSTEM_OWNER_USERNAME, actualUsername: owner.username },
        "configured system owner username does not match the protected account; account left untouched",
      );
    } else if (!(await verifyPassword(owner.password_hash, env.SYSTEM_OWNER_PASSWORD))) {
      logger.warn(
        "SYSTEM_OWNER_PASSWORD in the environment differs from the protected account's password; account left untouched (rotate via an explicit recovery task, never from startup)",
      );
    }
    return;
  }

  const conflict = await db.selectFrom("users").select(["id"]).where("username", "=", env.SYSTEM_OWNER_USERNAME).executeTakeFirst();
  if (conflict) {
    logger.warn(
      { username: env.SYSTEM_OWNER_USERNAME },
      "a user already holds the configured system owner username; not promoting it and not changing its password",
    );
    return;
  }

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
