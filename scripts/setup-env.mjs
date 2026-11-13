#!/usr/bin/env node
// One-time dev setup: creates .env.local from .env.example with a fresh Ed25519 signing key,
// and links it into apps/web (Next.js only reads env files from its own directory).
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const envPath = new URL(".env.local", root);

if (!existsSync(envPath)) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const kid = `k${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex")}`;
  const priv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url");
  const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64url");
  const env = readFileSync(new URL(".env.example", root), "utf8")
    .replace(/^CERT_SIGNING_ACTIVE_KID=.*$/m, `CERT_SIGNING_ACTIVE_KID=${kid}`)
    .replace(/^CERT_SIGNING_PRIVATE_KEY=.*$/m, `CERT_SIGNING_PRIVATE_KEY=${priv}`)
    .replace(/^CERT_PUBLIC_KEYS=.*$/m, `CERT_PUBLIC_KEYS='${JSON.stringify({ [kid]: pub })}'`)
    .replace(/^SETTINGS_ENCRYPTION_KEY=.*$/m, `SETTINGS_ENCRYPTION_KEY=${randomBytes(32).toString("base64url")}`);
  writeFileSync(envPath, env, { mode: 0o600 });
  chmodSync(envPath, 0o600);
  console.log("created .env.local (with a new certificate signing key and settings encryption key)");
} else {
  console.log(".env.local already exists: left unchanged");
}

const webLink = new URL("apps/web/.env.local", root);
if (!existsSync(webLink)) {
  symlinkSync("../../.env.local", webLink);
  console.log("linked apps/web/.env.local -> ../../.env.local");
}
