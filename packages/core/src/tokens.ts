import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256-bit random token, base64url. Sent to the user once; only its hash is stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 is enough here because tokens are high-entropy (no slow hash needed). */
export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
