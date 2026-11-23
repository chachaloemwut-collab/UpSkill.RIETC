import "server-only";
import { cookies } from "next/headers";
import { generateToken, hashToken } from "@upskill/core";
import { isHttpsOrigin } from "@upskill/infra/env";
import { ctx } from "../context";

const lifetime = 30 * 60;
const name = () => isHttpsOrigin(ctx().env) ? "__Host-google_signup" : "google_signup";
const key = (token: string) => "google-signup:" + hashToken(token).toString("hex");

export async function beginGoogleSignup(identity: { sub: string; email: string }) {
  const token = generateToken();
  const jar = await cookies();
  const prior = jar.get(name())?.value;
  if (prior) await ctx().redis.del(key(prior));
  await ctx().redis.set(key(token), JSON.stringify({ sub: identity.sub, email: identity.email }), "EX", lifetime);
  jar.set(name(), token, { httpOnly: true, secure: isHttpsOrigin(ctx().env), sameSite: "lax", path: "/", maxAge: lifetime });
}

export async function pendingGoogleSignup() {
  const token = (await cookies()).get(name())?.value;
  if (!token || token.length > 128) return null;
  const raw = await ctx().redis.get(key(token));
  if (!raw) return null;
  const identity = JSON.parse(raw) as { sub: string; email: string };
  return { ...identity, key: key(token) };
}

export async function finishGoogleSignup(redisKey: string) {
  (await cookies()).delete(name());
  await ctx().redis.del(redisKey);
}
