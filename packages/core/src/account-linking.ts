/**
 * Decides what to do when a user signs in with Google (spec 5.1 #1), with security fixes.
 *
 * Fix 1 - Pre-account hijacking:
 *   The spec says that if an unverified account exists, "tell the user to log in with the password first".
 *   But the password was set by whoever registered first (possibly an attacker), so the real email
 *   owner can never get in. Fix: when Google confirms ownership of the email, "take over" the
 *   unverified account: wipe the password, revoke all sessions, then link.
 *
 * Fix 2 - Trusting Google's email_verified:
 *   Google recommends treating email as authoritative only for @gmail.com or Workspace accounts (`hd` claim present).
 *   For other domains (a Google account created with an outside email), ownership may have lapsed,
 *   so never auto-link. The user must log in the normal way and link from the settings page.
 */

export interface GoogleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  hd?: string;
}

export interface LocalUserByEmail {
  id: string;
  emailVerified: boolean;
  status: "active" | "suspended" | "banned";
}

export type GoogleSignInDecision =
  | { action: "LOGIN"; userId: string }
  | { action: "LINK_AND_LOGIN"; userId: string }
  | { action: "TAKEOVER_UNVERIFIED_AND_LOGIN"; userId: string }
  | { action: "CREATE_USER_AND_LOGIN" }
  | { action: "REJECT"; reason: "EMAIL_NOT_VERIFIED" | "ACCOUNT_DISABLED" | "LINK_REQUIRES_LOGIN" };

export function isAuthoritativeGoogleEmail(c: GoogleClaims): boolean {
  if (!c.emailVerified) return false;
  return c.email.toLowerCase().endsWith("@gmail.com") || Boolean(c.hd);
}

export function decideGoogleSignIn(input: {
  claims: GoogleClaims;
  /** user_id from user_oauth_accounts that matches (provider='google', sub) */
  linkedUser: { id: string; status: LocalUserByEmail["status"] } | null;
  userByEmail: LocalUserByEmail | null;
}): GoogleSignInDecision {
  const { claims, linkedUser, userByEmail } = input;

  if (linkedUser) {
    return linkedUser.status === "active"
      ? { action: "LOGIN", userId: linkedUser.id }
      : { action: "REJECT", reason: "ACCOUNT_DISABLED" };
  }
  if (!claims.emailVerified) return { action: "REJECT", reason: "EMAIL_NOT_VERIFIED" };

  if (!userByEmail) return { action: "CREATE_USER_AND_LOGIN" };
  if (userByEmail.status !== "active") return { action: "REJECT", reason: "ACCOUNT_DISABLED" };
  if (!isAuthoritativeGoogleEmail(claims)) return { action: "REJECT", reason: "LINK_REQUIRES_LOGIN" };

  return userByEmail.emailVerified
    ? { action: "LINK_AND_LOGIN", userId: userByEmail.id }
    : { action: "TAKEOVER_UNVERIFIED_AND_LOGIN", userId: userByEmail.id };
}
