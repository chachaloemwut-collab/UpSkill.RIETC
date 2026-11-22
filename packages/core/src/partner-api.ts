// Pure helpers for the partner (server-to-server) API: key format and IP allowlists. No I/O.

/** `upk_<prefix>_<secret>`: prefix finds the client row, the whole key is hashed and compared. */
const KEY_RE = /^upk_([a-z0-9]{12})_([A-Za-z0-9_-]{40,64})$/;

export function parsePartnerKey(raw: string | null | undefined): { prefix: string; key: string } | null {
  const key = (raw ?? "").trim();
  const m = KEY_RE.exec(key);
  return m ? { prefix: m[1]!, key } : null;
}

/** Bearer token from an Authorization header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec((header ?? "").trim());
  return m ? m[1]! : null;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** An allowlist entry: an exact IPv4/IPv6 address or an IPv4 CIDR block (e.g. 203.0.113.0/24). */
export function isValidAllowlistEntry(entry: string): boolean {
  const e = entry.trim();
  const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(e);
  if (cidr) return ipv4ToInt(cidr[1]!) !== null && Number(cidr[2]) >= 8 && Number(cidr[2]) <= 32;
  if (ipv4ToInt(e) !== null) return true;
  return /^[0-9a-f:]+$/i.test(e) && e.includes(":") && e.length <= 45;
}

/** True when `ip` (as forwarded by the trusted reverse proxy) is on the allowlist. */
export function ipAllowed(ip: string, allowlist: readonly string[]): boolean {
  const addr = ip.trim().replace(/^::ffff:/i, "");
  const n = ipv4ToInt(addr);
  for (const raw of allowlist) {
    const entry = raw.trim();
    const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(entry);
    if (cidr && n !== null) {
      const base = ipv4ToInt(cidr[1]!);
      const bits = Number(cidr[2]);
      if (base === null) continue;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if (((n & mask) >>> 0) === ((base & mask) >>> 0)) return true;
    } else if (entry.toLowerCase() === addr.toLowerCase()) {
      return true;
    }
  }
  return false;
}

export const PARTNER_SCOPES = ["training:lookup"] as const;
export type PartnerScope = (typeof PARTNER_SCOPES)[number];
