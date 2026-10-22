/** 本地磁盘与 S3 兼容存储的统一接口，区分持久文件地址和临时读取地址。 */

import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { ENV } from "./_core/env";
import { getPublishedProductConfig } from "./repositories/productConfig";

/** 文件写入结果；key 用于服务端操作，url 用于前端或外部图片服务访问。 */
export type StoragePutResult = { key: string; url: string };

/** 去除前导斜杠并拒绝路径回退标记，防止本地存储目录穿越。 */
function normalizeKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "");
  // 所有驱动共用路径安全校验，阻止本地文件路径穿越。
  if (key.includes("..") || path.isAbsolute(key)) {
    throw new Error(`Invalid storage key: ${relKey}`);
  }
  return key;
}

/** 将存储键拼接为应用的持久文件访问地址。 */
function publicFileUrl(key: string): string {
  return `${ENV.publicUrl.replace(/\/+$/, "")}/files/${key}`;
}

// ---------------------------------------------------------------------------
// 本地磁盘驱动。
// ---------------------------------------------------------------------------

/** 将已经规范化的存储键映射为本地文件路径。 */
function localPathFor(key: string): string {
  return path.join(ENV.storageLocalDir, key);
}

/** 创建父目录并写入本地文件，返回应用文件路由地址。 */
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

/** 为文件路由创建本地读取流，文件不存在时返回 null。 */
export function localFileStream(
  relKey: string,
  range?: { start: number; end: number }
) {
  const key = normalizeKey(relKey);
  const filePath = localPathFor(key);
  if (!existsSync(filePath)) return null;
  return createReadStream(filePath, range);
}

/** 返回本地普通文件的字节数，文件不存在时返回 null。 */
export async function localFileSize(relKey: string): Promise<number | null> {
  try {
    const result = await stat(localPathFor(normalizeKey(relKey)));
    return result.isFile() ? result.size : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** 按存储键读取本地文件的完整字节，不存在或不可读时抛出错误。 */
export async function localFileRead(relKey: string): Promise<Buffer> {
  return readFile(localPathFor(normalizeKey(relKey)));
}

// ---------------------------------------------------------------------------
// S3 驱动按需创建客户端。
// ---------------------------------------------------------------------------

type S3Module = typeof import("@aws-sdk/client-s3");
let s3Client: import("@aws-sdk/client-s3").S3Client | null = null;
let s3Module: S3Module | null = null;

/** 惰性创建并缓存 S3 客户端，避免本地驱动加载无用 SDK。 */
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

/** 将字节上传到 S3，并返回稳定的应用文件路由地址。 */
async function s3Put(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<StoragePutResult> {
  const { client, mod } = await getS3();
  const body = typeof data === "string" ? Buffer.from(data) : data;
  const rules = (await getPublishedProductConfig()).runtime.storage;
  await client.send(
    new mod.PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
    { abortSignal: AbortSignal.timeout(rules.requestTimeoutMs) }
  );
  return { key, url: publicFileUrl(key) };
}

/** 为私有 S3 对象按发布配置生成临时 GET 地址。 */
export async function s3PresignedGetUrl(
  relKey: string,
  download = false
): Promise<string> {
  const key = normalizeKey(relKey);
  const { client, mod } = await getS3();
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const rules = (await getPublishedProductConfig()).runtime.storage;
  return getSignedUrl(
    client,
    new mod.GetObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      ...(download ? { ResponseContentDisposition: "attachment" } : {}),
    }),
    { expiresIn: rules.signedUrlTtlSeconds }
  );
}

// ---------------------------------------------------------------------------
// 业务层共用的存储接口。
// ---------------------------------------------------------------------------

/**
 * 使用当前驱动保存文件并返回存储键和持久访问地址。
 *
 * @param contentType - 上传到 S3 时使用的 MIME 类型，本地路由按扩展名决定响应类型
 */
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

/** 获取文件读取地址；S3 模式返回临时预签名 URL，本地模式返回应用文件地址。 */
export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  if (ENV.storageDriver === "s3") {
    return { key, url: await s3PresignedGetUrl(key) };
  }
  return { key, url: publicFileUrl(key) };
}

/**
 * 按存储键读取完整文件字节，供服务端向 ComfyUI 等服务上传。
 *
 * @remarks 此入口不按任意用户 URL 下载文件；文件读取错误向调用方传播。
 */
export async function storageRead(relKey: string): Promise<Buffer> {
  const key = normalizeKey(relKey);
  if (ENV.storageDriver !== "s3") return localFileRead(key);
  const { client, mod } = await getS3();
  const rules = (await getPublishedProductConfig()).runtime.storage;
  const result = await client.send(
    new mod.GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }),
    { abortSignal: AbortSignal.timeout(rules.requestTimeoutMs) }
  );
  if (!result.Body) throw new Error("Stored reference image is empty");
  return Buffer.from(await result.Body.transformToByteArray());
}

/** 幂等删除存储对象；本地文件缺失也视为成功，S3 使用发布超时。 */
export async function storageDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  if (!key) throw new Error("Empty storage key");
  if (ENV.storageDriver !== "s3") {
    await rm(localPathFor(key), { force: true });
    return;
  }
  const { client, mod } = await getS3();
  const rules = (await getPublishedProductConfig()).runtime.storage;
  await client.send(
    new mod.DeleteObjectCommand({ Bucket: ENV.s3Bucket, Key: key }),
    { abortSignal: AbortSignal.timeout(rules.requestTimeoutMs) }
  );
}
