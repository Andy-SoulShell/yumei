/**
 * Object storage with pluggable drivers (M1-2, replaces the Manus Forge
 * storage proxy).
 *
 * Drivers, selected by `STORAGE_DRIVER`:
 *   - `local` (default): files land on disk under `STORAGE_LOCAL_DIR`.
 *     Suitable for self-hosting and dev.
 *   - `s3`: AWS S3 or any S3-compatible endpoint (R2, MinIO) via
 *     `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
 *     / optional `S3_ENDPOINT`.
 *
 * Both drivers return the same *stable* public URL shape:
 *   `${PUBLIC_URL}/files/<key>`
 * The `/files` route (server/_core/files.ts) streams from disk or
 * redirects to a short-lived presigned S3 URL. Persisting the stable URL
 * in the DB means the storage backend can change without a data
 * migration, and private S3 buckets work because presigning happens at
 * read time.
 *
 * Keys embed a nanoid, so URLs are unguessable. Per-user read ACLs and
 * signed app-level URLs are tracked separately (issue #12).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { ENV } from "./_core/env";

export type StoragePutResult = { key: string; url: string };

function normalizeKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "");
  // Defense against path traversal for the local driver; S3 treats keys
  // as opaque but there's no reason to allow these anywhere.
  if (key.includes("..") || path.isAbsolute(key)) {
    throw new Error(`Invalid storage key: ${relKey}`);
  }
  return key;
}

function publicFileUrl(key: string): string {
  return `${ENV.publicUrl.replace(/\/+$/, "")}/files/${key}`;
}

// ---------------------------------------------------------------------------
// Local disk driver
// ---------------------------------------------------------------------------

function localPathFor(key: string): string {
  return path.join(ENV.storageLocalDir, key);
}

async function localPut(
  key: string,
  data: Buffer | Uint8Array | string,
  _contentType: string
): Promise<StoragePutResult> {
  const filePath = localPathFor(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
  return { key, url: publicFileUrl(key) };
}

/** Used by the /files route. Returns null when the file doesn't exist. */
export function localFileStream(relKey: string) {
  const key = normalizeKey(relKey);
  const filePath = localPathFor(key);
  if (!existsSync(filePath)) return null;
  return createReadStream(filePath);
}

/** Test helper / internal reads. */
export async function localFileRead(relKey: string): Promise<Buffer> {
  return readFile(localPathFor(normalizeKey(relKey)));
}

// ---------------------------------------------------------------------------
// S3 driver (lazy client so the SDK isn't constructed unless configured)
// ---------------------------------------------------------------------------

type S3Module = typeof import("@aws-sdk/client-s3");
let s3Client: import("@aws-sdk/client-s3").S3Client | null = null;
let s3Module: S3Module | null = null;

async function getS3(): Promise<{
  client: NonNullable<typeof s3Client>;
  mod: S3Module;
}> {
  if (!s3Client || !s3Module) {
    s3Module = await import("@aws-sdk/client-s3");
    s3Client = new s3Module.S3Client({
      region: ENV.s3Region,
      ...(ENV.s3Endpoint
        ? { endpoint: ENV.s3Endpoint, forcePathStyle: true }
        : {}),
      ...(ENV.s3AccessKeyId
        ? {
            credentials: {
              accessKeyId: ENV.s3AccessKeyId,
              secretAccessKey: ENV.s3SecretAccessKey,
            },
          }
        : {}),
    });
  }
  return { client: s3Client, mod: s3Module };
}

async function s3Put(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<StoragePutResult> {
  const { client, mod } = await getS3();
  const body = typeof data === "string" ? Buffer.from(data) : data;
  await client.send(
    new mod.PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return { key, url: publicFileUrl(key) };
}

/** Used by the /files route: presign a short-lived GET for a private bucket. */
export async function s3PresignedGetUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const { client, mod } = await getS3();
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(
    client,
    new mod.GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }),
    { expiresIn: 300 }
  );
}

// ---------------------------------------------------------------------------
// Public API (same shape the rest of the app already uses)
// ---------------------------------------------------------------------------

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<StoragePutResult> {
  const key = normalizeKey(relKey);
  if (ENV.storageDriver === "s3") {
    return s3Put(key, data, contentType);
  }
  return localPut(key, data, contentType);
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  if (ENV.storageDriver === "s3") {
    return { key, url: await s3PresignedGetUrl(key) };
  }
  return { key, url: publicFileUrl(key) };
}

/** Server-to-server image uploads must not depend on a public localhost URL. */
export async function storageRead(relKey: string): Promise<Buffer> {
  const key = normalizeKey(relKey);
  if (ENV.storageDriver !== "s3") return localFileRead(key);
  const { client, mod } = await getS3();
  const result = await client.send(
    new mod.GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key })
  );
  if (!result.Body) throw new Error("Stored reference image is empty");
  return Buffer.from(await result.Body.transformToByteArray());
}
