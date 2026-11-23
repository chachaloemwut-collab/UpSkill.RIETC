import "server-only";
import { createMailer, type EmailJob } from "@upskill/infra/mailer";
import { decryptSettingSecret, encryptSettingSecret, formatSender, smtpUrlFromSettings } from "@upskill/infra/secret-box";
import { ctx } from "../context";
import { HttpError } from "../http";
import { audit } from "../audit";

export type EmailSettingsInput = {
  enabled: boolean;
  senderName: string;
  senderEmail: string;
  replyToEmail?: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "none" | "starttls" | "tls";
  smtpUsername?: string | null;
  smtpPassword?: string | null;
};

function parseMailFrom(value: string): { name: string; email: string } {
  const match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return match ? { name: match[1]!.trim(), email: match[2]!.trim() } : { name: "", email: value.trim() };
}

function environmentSettings() {
  const { env } = ctx();
  const smtp = new URL(env.SMTP_URL);
  const sender = parseMailFrom(env.MAIL_FROM);
  return {
    enabled: true,
    senderName: sender.name,
    senderEmail: sender.email,
    replyToEmail: null,
    smtpHost: smtp.hostname,
    smtpPort: Number(smtp.port || (smtp.protocol === "smtps:" ? 465 : 587)),
    smtpSecurity: (smtp.protocol === "smtps:" ? "tls" : smtp.searchParams.get("requireTLS") === "true" ? "starttls" : "none") as "none" | "starttls" | "tls",
    smtpUsername: decodeURIComponent(smtp.username || ""),
    passwordConfigured: Boolean(smtp.password),
    source: "environment" as const,
    version: 0,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestError: null,
  };
}

/** Public availability only. No sender credentials or recipient details leave the server. */
export async function emailRequestsAvailable() {
  const { db,env }=ctx();
  const row=await db.selectFrom("email_provider_settings").select(["enabled","smtp_host"]).where("id","=",1).executeTakeFirst();
  const host=(row?.smtp_host ?? new URL(env.SMTP_URL).hostname).trim().toLowerCase();
  return (row?.enabled ?? true) && !!host && !host.endsWith(".invalid");
}

export async function requireOutboundEmail() {
  if (!await emailRequestsAvailable()) {
    throw new HttpError(503, "EMAIL_UNAVAILABLE", "ขณะนี้ระบบอีเมลยังไม่พร้อมส่งลิงก์ กรุณาติดต่อผู้ดูแลระบบ");
  }
}

export async function getEmailSettingsView() {
  const row = await ctx().db.selectFrom("email_provider_settings").selectAll().where("id", "=", 1).executeTakeFirst();
  if (!row) return environmentSettings();
  return {
    enabled: row.enabled,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    replyToEmail: row.reply_to_email,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecurity: row.smtp_security as "none" | "starttls" | "tls",
    smtpUsername: row.smtp_username ?? "",
    passwordConfigured: Boolean(row.smtp_password_encrypted),
    source: "database" as const,
    version: row.version,
    lastTestedAt: row.last_tested_at?.toISOString() ?? null,
    lastTestStatus: row.last_test_status,
    lastTestError: row.last_test_error,
  };
}

export async function updateEmailSettings(adminId: string, input: EmailSettingsInput, meta: { ip: string }) {
  const { db, env } = ctx();
  const existing = await db.selectFrom("email_provider_settings").selectAll().where("id", "=", 1).executeTakeFirst();
  const username = input.smtpUsername?.trim() || null;
  let encryptedPassword = existing?.smtp_password_encrypted ?? null;
  if (input.smtpPassword) encryptedPassword = encryptSettingSecret(input.smtpPassword, env.SETTINGS_ENCRYPTION_KEY);
  if (!username) encryptedPassword = null;
  if (username && !encryptedPassword) throw new HttpError(400, "SMTP_PASSWORD_REQUIRED");

  const values = {
    enabled: input.enabled,
    sender_name: input.senderName.trim(),
    sender_email: input.senderEmail.trim().toLowerCase(),
    reply_to_email: input.replyToEmail?.trim().toLowerCase() || null,
    smtp_host: input.smtpHost.trim().toLowerCase(),
    smtp_port: input.smtpPort,
    smtp_security: input.smtpSecurity,
    smtp_username: username,
    smtp_password_encrypted: encryptedPassword,
    version: (existing?.version ?? 0) + 1,
    updated_by: adminId,
    last_tested_at: null,
    last_test_status: null,
    last_test_error: null,
  };
  if (existing) await db.updateTable("email_provider_settings").set(values).where("id", "=", 1).execute();
  else await db.insertInto("email_provider_settings").values({ id: 1, ...values }).execute();
  await audit(db, {
    action: "system.email_settings_updated",
    userId: adminId,
    entityType: "email_provider_settings",
    ip: meta.ip,
    details: { enabled: input.enabled, senderEmail: values.sender_email, smtpHost: values.smtp_host, smtpPort: values.smtp_port, smtpSecurity: values.smtp_security, usernameConfigured: Boolean(username), passwordChanged: Boolean(input.smtpPassword) },
  });
}

async function senderFromSavedSettings() {
  const { db, env } = ctx();
  const row = await db.selectFrom("email_provider_settings").selectAll().where("id", "=", 1).executeTakeFirst();
  if (!row) return createMailer(env.SMTP_URL, env.MAIL_FROM);
  if (!row.enabled) throw new HttpError(409, "EMAIL_SENDING_DISABLED");
  const password = row.smtp_password_encrypted ? decryptSettingSecret(row.smtp_password_encrypted, env.SETTINGS_ENCRYPTION_KEY) : null;
  const smtpUrl = smtpUrlFromSettings({ host: row.smtp_host, port: row.smtp_port, security: row.smtp_security as "none" | "starttls" | "tls", username: row.smtp_username, password });
  return createMailer(smtpUrl, formatSender(row.sender_name, row.sender_email), row.reply_to_email);
}

export async function testEmailSettings(adminId: string, recipient: string, meta: { ip: string }) {
  const { db, env } = ctx();
  let status: "success" | "failed" = "success";
  let errorMessage: string | null = null;
  try {
    const send = await senderFromSavedSettings();
    const job: EmailJob = { template: "system-alert", to: recipient, title: "ทดสอบการส่งอีเมล", details: "การตั้งค่าอีเมลระบบสามารถส่งข้อความได้", manageLink: `${env.APP_ORIGIN}/admin` };
    await send(job);
  } catch (error) {
    status = "failed";
    errorMessage = error instanceof Error ? error.message.slice(0, 500) : "email test failed";
  }
  await db.updateTable("email_provider_settings").set({ last_tested_at: new Date(), last_test_status: status, last_test_error: errorMessage }).where("id", "=", 1).execute();
  await audit(db, { action: "system.email_settings_tested", userId: adminId, entityType: "email_provider_settings", ip: meta.ip, details: { status, recipient } });
  if (status === "failed") throw new HttpError(422, "EMAIL_TEST_FAILED");
}

