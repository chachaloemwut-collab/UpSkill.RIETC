import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localCertificateStorage, s3CertificateStorage } from "./storage.ts";

const CODE = "CERT-2026-AAAA-BBBB-CCCC";

// Minimal in-memory S3 client double: PutObject stores into a Map, GetObject reads back.
function fakeS3Client() {
  const objects = new Map<string, Buffer>();
  const client = {
    async send(cmd: { input: { Bucket: string; Key: string; Body?: Uint8Array } }) {
      const { Key, Body } = cmd.input;
      if (Body !== undefined) {
        objects.set(Key, Buffer.from(Body));
        return {};
      }
      const bytes = objects.get(Key);
      if (!bytes) {
        const err = new Error("not found") as Error & { name: string; $metadata: { httpStatusCode: number } };
        err.name = "NoSuchKey";
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return { Body: { transformToByteArray: async () => bytes } };
    },
  };
  return { client: client as unknown as S3Client, objects };
}

describe("localCertificateStorage", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "cert-storage-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a PDF", async () => {
    const storage = localCertificateStorage(dir);
    const pdf = new Uint8Array([1, 2, 3, 4, 5]);
    await storage.save(CODE, pdf);
    await expect(storage.read(CODE)).resolves.toEqual(Buffer.from(pdf));
  });

  it("returns null when not rendered yet", async () => {
    await expect(localCertificateStorage(dir).read(CODE)).resolves.toBeNull();
  });

  it("rejects a crafted code (path traversal)", async () => {
    await expect(localCertificateStorage(dir).read("../../etc/passwd")).rejects.toThrow("invalid certificate code");
  });
});

describe("s3CertificateStorage", () => {
  it("round-trips a PDF through the client", async () => {
    const { client, objects } = fakeS3Client();
    const storage = s3CertificateStorage({ bucket: "b", region: "us-east-1", client });
    const pdf = new Uint8Array([9, 8, 7]);
    await storage.save(CODE, pdf);
    expect(objects.get(`${CODE}.pdf`)).toEqual(Buffer.from(pdf));
    await expect(storage.read(CODE)).resolves.toEqual(Buffer.from(pdf));
  });

  it("returns null on NoSuchKey", async () => {
    const { client } = fakeS3Client();
    await expect(s3CertificateStorage({ bucket: "b", region: "us-east-1", client }).read(CODE)).resolves.toBeNull();
  });

  it("rejects a crafted code", async () => {
    const { client } = fakeS3Client();
    await expect(s3CertificateStorage({ bucket: "b", region: "us-east-1", client }).read("../etc")).rejects.toThrow("invalid certificate code");
  });
});
