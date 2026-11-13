import { describe, expect, it } from "vitest";
import { decideGoogleSignIn, type GoogleClaims } from "./account-linking.js";

const gmail: GoogleClaims = { sub: "1", email: "a@gmail.com", emailVerified: true };
const other: GoogleClaims = { sub: "2", email: "a@company.co.th", emailVerified: true };

describe("decideGoogleSignIn", () => {
  it("logs in an already-linked account", () => {
    expect(decideGoogleSignIn({ claims: gmail, linkedUser: { id: "u", status: "active" }, userByEmail: null })).toEqual({
      action: "LOGIN",
      userId: "u",
    });
  });
  it("creates a new user when nothing matches", () => {
    expect(decideGoogleSignIn({ claims: gmail, linkedUser: null, userByEmail: null })).toEqual({ action: "CREATE_USER_AND_LOGIN" });
  });
  it("auto-links a verified local account for authoritative emails", () => {
    expect(
      decideGoogleSignIn({ claims: gmail, linkedUser: null, userByEmail: { id: "u", emailVerified: true, status: "active" } }),
    ).toEqual({ action: "LINK_AND_LOGIN", userId: "u" });
  });
  it("takes over an unverified squatted account (pre-hijack defence)", () => {
    expect(
      decideGoogleSignIn({ claims: gmail, linkedUser: null, userByEmail: { id: "u", emailVerified: false, status: "active" } }),
    ).toEqual({ action: "TAKEOVER_UNVERIFIED_AND_LOGIN", userId: "u" });
  });
  it("never auto-links non-authoritative Google emails", () => {
    expect(
      decideGoogleSignIn({ claims: other, linkedUser: null, userByEmail: { id: "u", emailVerified: true, status: "active" } }),
    ).toEqual({ action: "REJECT", reason: "LINK_REQUIRES_LOGIN" });
  });
  it("accepts Workspace (hd) emails as authoritative", () => {
    expect(
      decideGoogleSignIn({
        claims: { ...other, hd: "company.co.th" },
        linkedUser: null,
        userByEmail: { id: "u", emailVerified: true, status: "active" },
      }),
    ).toEqual({ action: "LINK_AND_LOGIN", userId: "u" });
  });
  it("rejects banned users", () => {
    expect(decideGoogleSignIn({ claims: gmail, linkedUser: { id: "u", status: "banned" }, userByEmail: null })).toMatchObject({
      action: "REJECT",
    });
  });
});
