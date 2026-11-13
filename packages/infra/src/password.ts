// Argon2id (the library default) with parameters per the OWASP Password Storage Cheat Sheet
import { hash, verify } from "@node-rs/argon2";

const PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_POLICY = { minLength: 12, maxLength: 128 } as const;

export function validatePasswordPolicy(pw: string): string | null {
  // Count length in code points (not UTF-16 units). No forced character classes (NIST SP 800-63B)
  const len = [...pw].length;
  if (len < PASSWORD_POLICY.minLength) return `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_POLICY.minLength} ตัวอักษร`;
  if (len > PASSWORD_POLICY.maxLength) return "รหัสผ่านยาวเกินไป";
  return null;
}

export function hashPassword(pw: string): Promise<string> {
  return hash(pw.normalize("NFKC"), PARAMS);
}

// Precomputed hash for unknown accounts, so response time doesn't reveal whether an email exists
let dummy: Promise<string> | undefined;

export async function verifyPassword(storedHash: string | null | undefined, pw: string): Promise<boolean> {
  const target = storedHash ?? (await (dummy ??= hashPassword("dummy-password-for-timing")));
  try {
    const ok = await verify(target, pw.normalize("NFKC"));
    return ok && storedHash != null;
  } catch {
    return false;
  }
}
