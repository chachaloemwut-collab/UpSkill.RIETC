import { describe, expect, it } from "vitest";
import { bearerToken, ipAllowed, isValidAllowlistEntry, parsePartnerKey } from "./partner-api.ts";

const KEY = `upk_abcdef123456_${"A".repeat(43)}`;

describe("partner keys", () => {
  it("parses only the exact key format", () => {
    expect(parsePartnerKey(KEY)).toEqual({ prefix: "abcdef123456", key: KEY });
    expect(parsePartnerKey(`upk_ABCDEF123456_${"A".repeat(43)}`)).toBeNull();
    expect(parsePartnerKey("upk_short_x")).toBeNull();
    expect(parsePartnerKey(null)).toBeNull();
  });
  it("reads a bearer token", () => {
    expect(bearerToken(`Bearer ${KEY}`)).toBe(KEY);
    expect(bearerToken(`Basic ${KEY}`)).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("IP allowlist", () => {
  it("matches exact addresses and IPv4 CIDR blocks", () => {
    expect(ipAllowed("203.0.113.7", ["203.0.113.7"])).toBe(true);
    expect(ipAllowed("203.0.113.7", ["203.0.113.0/24"])).toBe(true);
    expect(ipAllowed("203.0.114.7", ["203.0.113.0/24"])).toBe(false);
    expect(ipAllowed("::ffff:203.0.113.7", ["203.0.113.7"])).toBe(true);
    expect(ipAllowed("2001:db8::1", ["2001:DB8::1"])).toBe(true);
    expect(ipAllowed("0.0.0.0", ["203.0.113.7"])).toBe(false);
    expect(ipAllowed("203.0.113.7", [])).toBe(false);
  });
  it("validates entries an admin types in", () => {
    expect(isValidAllowlistEntry("203.0.113.7")).toBe(true);
    expect(isValidAllowlistEntry("203.0.113.0/24")).toBe(true);
    expect(isValidAllowlistEntry("0.0.0.0/0")).toBe(false); // the whole internet is not an allowlist
    expect(isValidAllowlistEntry("10.0.0.0/4")).toBe(false);
    expect(isValidAllowlistEntry("999.1.1.1")).toBe(false);
    expect(isValidAllowlistEntry("2001:db8::1")).toBe(true);
    expect(isValidAllowlistEntry("example.com")).toBe(false);
  });
});
