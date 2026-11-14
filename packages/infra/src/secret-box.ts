import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

function keyBytes(key: string): Buffer {
  const decoded = Buffer.from(key, "base64url");
  if (decoded.length !== 32) throw new Error("SETTINGS_ENCRYPTION_KEY must contain exactly 32 bytes");
  return decoded;
}

export function encryptSettingSecret(value: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSettingSecret(value: string, key: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) throw new Error("Unsupported encrypted setting format");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

export type SmtpRuntimeSettings = {
  host: string;
  port: number;
  security: "none" | "starttls" | "tls";
  username: string | null;
  password: string | null;
};

export function smtpUrlFromSettings(settings: SmtpRuntimeSettings): string {
  const url = new URL(`${settings.security === "tls" ? "smtps" : "smtp"}://localhost`);
  url.hostname = settings.host;
  url.port = String(settings.port);
  if (settings.username && settings.password) {
    url.username = settings.username;
    url.password = settings.password;
  }
  if (settings.security === "starttls") url.searchParams.set("requireTLS", "true");
  return url.toString();
}

export function formatSender(name: string, email: string): string {
  const escaped = name.replace(/["\\\r\n]/g, "").trim();
  return escaped ? `"${escaped}" <${email}>` : email;
}


/**
 * Keyed digest of a national ID, for "one account per person" lookups without storing the number in clear.
 * The key is derived from SETTINGS_ENCRYPTION_KEY (HKDF, own label), so no extra secret has to be deployed.
 * Rotating SETTINGS_ENCRYPTION_KEY requires re-computing these digests from the encrypted values.
 */
export function nationalIdDigest(nationalId: string, key: string): Buffer {
  const macKey = Buffer.from(hkdfSync("sha256", keyBytes(key), Buffer.alloc(0), "upskill:national-id:v1", 32));
  return createHmac("sha256", macKey).update(nationalId, "utf8").digest();
}
