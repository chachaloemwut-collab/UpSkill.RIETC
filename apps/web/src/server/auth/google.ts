/**
 * Google OAuth 2.0 / OIDC: Authorization Code + PKCE (spec 5.1)
 *
 * - state / code_verifier / nonce are kept in Redis (single-use via GETDEL, 10-minute TTL)
 * - a cookie stores state too, binding the flow to this browser (prevents login CSRF / code injection)
 * - the id_token is verified with Google's JWKS: iss, aud, exp, nonce
 * - [CHANGED] spec uses prompt=login, which Google does not support (only none|consent|select_account).
 *   Use prompt=select_account, and for reset mode require a fresh callback from this flow (we control the timing).
 */
import "server-only";
import { Google, generateCodeVerifier, generateState } from "arctic";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import type { GoogleClaims } from "@upskill/core";
import { ctx } from "../context";
import { HttpError } from "../http";

export type OAuthMode = "login" | "link" | "reset";

const STATE_COOKIE = process.env.NODE_ENV === "production" ? "__Host-oauth_state" : "oauth_state";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function client() {
  const { env } = ctx();
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

export async function buildGoogleAuthUrl(mode: OAuthMode, linkUserId?: string): Promise<URL> {
  const { redis } = ctx();
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const nonce = randomBytes(16).toString("base64url");

  await redis.set(`oauth:${state}`, JSON.stringify({ codeVerifier, nonce, mode, linkUserId }), "PX", 10 * 60_000);
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must be Lax: the callback is a cross-site top-level GET from accounts.google.com
    path: "/",
    maxAge: 600,
  });

  const url = client().createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("prompt", "select_account");
  return url;
}

export async function completeGoogleCallback(
  stateParam: string | null,
  code: string | null,
): Promise<{ claims: GoogleClaims; mode: OAuthMode; linkUserId?: string }> {
  const { env, redis } = ctx();
  const jar = await cookies();
  const cookieState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (!stateParam || !code || !cookieState || cookieState !== stateParam) throw new HttpError(400, "OAUTH_STATE_MISMATCH");
  const raw = await redis.getdel(`oauth:${stateParam}`);
  if (!raw) throw new HttpError(400, "OAUTH_STATE_EXPIRED");
  const saved = JSON.parse(raw) as { codeVerifier: string; nonce: string; mode: OAuthMode; linkUserId?: string };

  const tokens = await client().validateAuthorizationCode(code, saved.codeVerifier);
  const { payload } = await jwtVerify(tokens.idToken(), GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.GOOGLE_CLIENT_ID,
    clockTolerance: 30,
  });
  if (payload.nonce !== saved.nonce) throw new HttpError(400, "OAUTH_NONCE_MISMATCH");
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") throw new HttpError(400, "OAUTH_BAD_CLAIMS");

  return {
    claims: {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      ...(typeof payload.hd === "string" ? { hd: payload.hd } : {}),
    },
    mode: saved.mode,
    ...(saved.linkUserId ? { linkUserId: saved.linkUserId } : {}),
  };
}
