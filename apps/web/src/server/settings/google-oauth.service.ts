import "server-only";
import { googleConfig } from "@upskill/infra/env";
import { decryptSettingSecret, encryptSettingSecret } from "@upskill/infra/secret-box";
import { audit } from "../audit";
import { ctx } from "../context";
import { HttpError } from "../http";

export async function getGoogleRuntimeConfig(): Promise<{ clientId: string; clientSecret: string; redirectUri: string } | null> {
  const { db, env } = ctx();
  const row = await db.selectFrom("google_oauth_settings").selectAll().where("id", "=", 1).executeTakeFirst();
  if (!row) return googleConfig(env);
  if (!row.enabled || !row.client_id || !row.client_secret_encrypted) return null;
  return {
    clientId: row.client_id,
    clientSecret: decryptSettingSecret(row.client_secret_encrypted, env.SETTINGS_ENCRYPTION_KEY),
    redirectUri: `${env.APP_ORIGIN}/api/auth/google/callback`,
  };
}

export async function getGoogleOAuthSettingsView() {
  const { db, env } = ctx();
  const row = await db.selectFrom("google_oauth_settings").selectAll().where("id", "=", 1).executeTakeFirst();
  if (row) {
    return {
      enabled: row.enabled,
      clientId: row.client_id ?? "",
      secretConfigured: Boolean(row.client_secret_encrypted),
      redirectUri: `${env.APP_ORIGIN}/api/auth/google/callback`,
      source: "database" as const,
      version: row.version,
    };
  }
  const fallback = googleConfig(env);
  return {
    enabled: Boolean(fallback),
    clientId: fallback?.clientId ?? "",
    secretConfigured: Boolean(fallback?.clientSecret),
    redirectUri: `${env.APP_ORIGIN}/api/auth/google/callback`,
    source: "environment" as const,
    version: 0,
  };
}

export async function updateGoogleOAuthSettings(
  adminId: string,
  input: { enabled: boolean; clientId?: string | null; clientSecret?: string | null },
  meta: { ip: string },
) {
  const { db, env } = ctx();
  const existing = await db.selectFrom("google_oauth_settings").selectAll().where("id", "=", 1).executeTakeFirst();
  const clientId = input.clientId?.trim() || null;
  let encryptedSecret = existing?.client_secret_encrypted ?? null;
  if (input.clientSecret) encryptedSecret = encryptSettingSecret(input.clientSecret, env.SETTINGS_ENCRYPTION_KEY);
  if (existing?.client_id && clientId !== existing.client_id && !input.clientSecret) throw new HttpError(400, "GOOGLE_SECRET_REQUIRED");
  if (input.enabled && (!clientId || !encryptedSecret)) throw new HttpError(400, "GOOGLE_CREDENTIALS_REQUIRED");

  const values = {
    enabled: input.enabled,
    client_id: clientId,
    client_secret_encrypted: encryptedSecret,
    version: (existing?.version ?? 0) + 1,
    updated_by: adminId,
  };
  if (existing) await db.updateTable("google_oauth_settings").set(values).where("id", "=", 1).execute();
  else await db.insertInto("google_oauth_settings").values({ id: 1, ...values }).execute();

  await audit(db, {
    action: "system.google_oauth_settings_updated",
    userId: adminId,
    entityType: "google_oauth_settings",
    ip: meta.ip,
    details: { enabled: input.enabled, clientIdChanged: clientId !== existing?.client_id, secretChanged: Boolean(input.clientSecret) },
  });
}

