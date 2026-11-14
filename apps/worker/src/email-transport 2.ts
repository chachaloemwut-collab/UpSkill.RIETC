import type { Database } from "@upskill/db";
import type { Env } from "@upskill/infra/env";
import { createMailer } from "@upskill/infra/mailer";
import { decryptSettingSecret, formatSender, smtpUrlFromSettings } from "@upskill/infra/secret-box";

type Sender = ReturnType<typeof createMailer>;

export function configuredEmailSender(db: Database, env: Env): () => Promise<Sender | null> {
  let cacheKey = "";
  let cached: Sender | null = null;
  return async () => {
    const row = await db.selectFrom("email_provider_settings").selectAll().where("id", "=", 1).executeTakeFirst();
    if (!row) {
      if (cacheKey !== "environment") {
        cacheKey = "environment";
        cached = createMailer(env.SMTP_URL, env.MAIL_FROM);
      }
      return cached;
    }
    const nextKey = `database:${row.version}:${row.enabled}`;
    if (cacheKey === nextKey) return cached;
    cacheKey = nextKey;
    if (!row.enabled) return (cached = null);
    const password = row.smtp_password_encrypted ? decryptSettingSecret(row.smtp_password_encrypted, env.SETTINGS_ENCRYPTION_KEY) : null;
    const smtpUrl = smtpUrlFromSettings({ host: row.smtp_host, port: row.smtp_port, security: row.smtp_security as "none" | "starttls" | "tls", username: row.smtp_username, password });
    cached = createMailer(smtpUrl, formatSender(row.sender_name, row.sender_email), row.reply_to_email);
    return cached;
  };
}

