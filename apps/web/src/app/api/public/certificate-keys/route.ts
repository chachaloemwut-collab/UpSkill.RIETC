// Served at /.well-known/certificate-keys.json (rewrite in next.config.ts)
// Lets third parties (HR, universities) verify certificate signatures offline
import { NextResponse } from "next/server";
import { getEnv } from "@upskill/infra/env";

export function GET() {
  const env = getEnv();
  const keys = Object.entries(env.CERT_PUBLIC_KEYS).map(([kid, spki]) => ({
    kid,
    alg: "EdDSA",
    crv: "Ed25519",
    format: "spki-der-base64url",
    key: spki,
    active: kid === env.CERT_SIGNING_ACTIVE_KID,
  }));
  return NextResponse.json({ keys }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
