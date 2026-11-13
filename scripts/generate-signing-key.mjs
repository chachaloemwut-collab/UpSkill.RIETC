#!/usr/bin/env node
// Generates an Ed25519 key pair for signing certificates.
// The private key goes into the Secret Manager. The public key is added to CERT_PUBLIC_KEYS
// and published at /.well-known/certificate-keys.json.
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const kid = `k${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex")}`;

const priv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url");
const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64url");

process.stdout.write(
  [
    `CERT_SIGNING_ACTIVE_KID=${kid}`,
    `CERT_SIGNING_PRIVATE_KEY=${priv}`,
    `# merge into CERT_PUBLIC_KEYS:`,
    `#   "${kid}":"${pub}"`,
    "",
  ].join("\n"),
);
