// Certificate PDF storage. Local disk for dev; swap for S3/GCS (private bucket) in production
// by keeping this same interface.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CERTIFICATE_CODE_RE } from "@upskill/core";

function fileFor(dir: string, code: string): string {
  // Allowlist the name so a crafted code can never escape the directory (path traversal)
  if (!CERTIFICATE_CODE_RE.test(code)) throw new Error("invalid certificate code");
  return path.join(path.resolve(dir), `${code}.pdf`);
}

export async function saveCertificatePdf(dir: string, code: string, pdf: Uint8Array): Promise<void> {
  await mkdir(path.resolve(dir), { recursive: true });
  await writeFile(fileFor(dir, code), pdf, { mode: 0o600 });
}

/** null = not rendered yet */
export async function readCertificatePdf(dir: string, code: string): Promise<Buffer | null> {
  try {
    return await readFile(fileFor(dir, code));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
