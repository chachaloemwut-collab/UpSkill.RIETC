import type { Database } from "@upskill/db";
import type { Env } from "@upskill/infra/env";
import { createCertificateStorage } from "@upskill/infra/storage";
import { createMailer, renderEmail } from "@upskill/infra/mailer";
import { decryptSettingSecret, formatSender, smtpUrlFromSettings } from "@upskill/infra/secret-box";

type Sender = ReturnType<typeof createMailer>;

export function configuredEmailSender(db: Database, env: Env): () => Promise<Sender | null> {
  let cacheKey = "";
  let cached: Sender | null = null;
  const resolve = async () => {
    const row = await db.selectFrom("email_provider_settings").selectAll().where("id", "=", 1).executeTakeFirst();
    if (!row) {
      if (new URL(env.SMTP_URL).hostname.endsWith(".invalid")) return null;
      if (cacheKey !== "environment") {
        cached = createMailer(env.SMTP_URL, env.MAIL_FROM);
        cacheKey = "environment";
      }
      return cached;
    }
    const nextKey = `database:${row.version}:${row.enabled}`;
    if (cacheKey === nextKey) return cached;
    if (!row.enabled) { cacheKey = nextKey; return (cached = null); }
    const password = row.smtp_password_encrypted ? decryptSettingSecret(row.smtp_password_encrypted, env.SETTINGS_ENCRYPTION_KEY) : null;
    const smtpUrl = smtpUrlFromSettings({ host: row.smtp_host, port: row.smtp_port, security: row.smtp_security as "none" | "starttls" | "tls", username: row.smtp_username, password });
    cached = createMailer(smtpUrl, formatSender(row.sender_name, row.sender_email), row.reply_to_email);
    cacheKey = nextKey;
    return cached;
  };
  return async () => {
    const send = await resolve();
    if (!send) return null;
    return async job => {
      if (job.template === "credential-ready") {
        const pdf = await createCertificateStorage(env).read(job.code);
        if (!pdf) throw new Error("Certificate PDF unavailable");
        return send(job,[{ filename:job.code+".pdf", content:pdf, contentType:"application/pdf" }]);
      }
      if (job.template === "membership-confirmed") {
        const p = await db.selectFrom("user_profiles as p").innerJoin("users as u","u.id","p.user_id")
          .select(["p.title_th","p.first_name_th","p.last_name_th","p.title_en","p.first_name_en","p.last_name_en","p.phone","p.address_line","p.subdistrict","p.district","p.province","p.postal_code","p.national_id_last4","p.guardian_name"])
          .where("u.email","=",job.to).where("u.email_verified_at","is not",null).where("u.deleted_at","is",null).executeTakeFirst();
        const fields = p ? [
          `ชื่อภาษาไทย: ${p.title_th} ${p.first_name_th} ${p.last_name_th}`, `ชื่อภาษาอังกฤษ: ${p.title_en} ${p.first_name_en} ${p.last_name_en}`,
          `เลขประจำตัวประชาชนสี่หลักท้าย: ${p.national_id_last4}`, `โทรศัพท์: ${p.phone}`,
          `ที่อยู่: ${[p.address_line,p.subdistrict,p.district,p.province,p.postal_code].join(" ")}`, ...(p.guardian_name ? [`ชื่อผู้ปกครองที่ผู้สมัครแจ้ง: ${p.guardian_name}`] : []),
        ] : [];
        const copy = [renderEmail(job).text, ...fields].join("\n");
        return send(job,[{ filename:"membership-confirmation.txt", content:Buffer.from(copy,"utf8"), contentType:"text/plain; charset=utf-8" }]);
      }
      return send(job);
    };
  };
}

