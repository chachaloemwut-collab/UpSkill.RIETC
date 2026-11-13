import "server-only";
import { createHash } from "node:crypto";

/** Rate-limit key for an email: hashed so raw addresses never end up in Redis keys */
export function emailKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}
