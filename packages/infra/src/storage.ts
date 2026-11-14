// Certificate PDF storage. Two backends behind one interface:
//   - "local": local disk (dev / single-server deployments)
//   - "s3":    S3-compatible private bucket (AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces, …)
// The web streams the PDF from this backend after its own auth/IDOR checks, so no public
// signed URL is exposed — the S3 credentials stay server-side.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { CERTIFICATE_CODE_RE } from "@upskill/core";
import type { Env } from "./env.ts";

export interface CertificateStorage {
  save(code: string, pdf: Uint8Array): Promise<void>;
  /** null = not rendered yet */
  read(code: string): Promise<Buffer | null>;
}

function assertCode(code: string): void {
  // Allowlist the name so a crafted code can never escape the directory / object key
  if (!CERTIFICATE_CODE_RE.test(code)) throw new Error("invalid certificate code");
}

export function localCertificateStorage(dir: string): CertificateStorage {
  const fileFor = (code: string): string => {
    assertCode(code);
    return path.join(path.resolve(dir), `${code}.pdf`);
  };
  return {
    async save(code, pdf) {
      await mkdir(path.resolve(dir), { recursive: true });
      await writeFile(fileFor(code), pdf, { mode: 0o600 });
    },
    async read(code) {
      try {
        return await readFile(fileFor(code));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
  };
}

// One S3Client per (bucket, region, endpoint) so repeated calls reuse the same connection pool.
const s3Clients = new Map<string, S3Client>();
function getS3Client(bucket: string, region: string, endpoint?: string): S3Client {
  const key = `${bucket}\u0000${region}\u0000${endpoint ?? ""}`;
  let client = s3Clients.get(key);
  if (!client) {
    client = new S3Client({ region, ...(endpoint ? { endpoint, forcePathStyle: true } : {}) });
    s3Clients.set(key, client);
  }
  return client;
}

export function s3CertificateStorage(cfg: { bucket: string; region: string; endpoint?: string; client?: S3Client }): CertificateStorage {
  const client = cfg.client ?? getS3Client(cfg.bucket, cfg.region, cfg.endpoint);
  const keyFor = (code: string): string => {
    assertCode(code);
    return `${code}.pdf`;
  };
  return {
    async save(code, pdf) {
      await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: keyFor(code), Body: Buffer.from(pdf), ContentType: "application/pdf" }));
    },
    async read(code) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: keyFor(code) }));
        const bytes = await out.Body?.transformToByteArray();
        return bytes ? Buffer.from(bytes) : null;
      } catch (err) {
        const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
  };
}

export function createCertificateStorage(env: Env): CertificateStorage {
  if (env.CERT_STORAGE_DRIVER === "s3") {
    // env validation guarantees these exist when driver === "s3"
    return s3CertificateStorage({
      bucket: env.CERT_S3_BUCKET!,
      region: env.CERT_S3_REGION!,
      ...(env.CERT_S3_ENDPOINT ? { endpoint: env.CERT_S3_ENDPOINT } : {}),
    });
  }
  return localCertificateStorage(env.CERT_STORAGE_DIR);
}
