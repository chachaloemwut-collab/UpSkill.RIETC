import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSettingSecret, encryptSettingSecret, formatSender, smtpUrlFromSettings } from "./secret-box.ts";

describe("encrypted runtime settings", () => {
  it("round-trips an SMTP password without storing plaintext", () => {
    const key = randomBytes(32).toString("base64url");
    const encrypted = encryptSettingSecret("app-password-123", key);
    expect(encrypted).not.toContain("app-password-123");
    expect(decryptSettingSecret(encrypted, key)).toBe("app-password-123");
  });

  it("rejects decryption with a different key", () => {
    const encrypted = encryptSettingSecret("secret", randomBytes(32).toString("base64url"));
    expect(() => decryptSettingSecret(encrypted, randomBytes(32).toString("base64url"))).toThrow();
  });

  it("builds an encoded STARTTLS connection URL", () => {
    const url = new URL(smtpUrlFromSettings({ host: "smtp.example.com", port: 587, security: "starttls", username: "name@example.com", password: "p@ss:/word" }));
    expect(url.protocol).toBe("smtp:");
    expect(url.hostname).toBe("smtp.example.com");
    expect(url.searchParams.get("requireTLS")).toBe("true");
    expect(decodeURIComponent(url.username)).toBe("name@example.com");
    expect(decodeURIComponent(url.password)).toBe("p@ss:/word");
  });

  it("removes header-breaking characters from the sender name", () => {
    expect(formatSender("Training\r\nBcc: attacker@example.com", "no-reply@example.com")).toBe('"TrainingBcc: attacker@example.com" <no-reply@example.com>');
  });
});

