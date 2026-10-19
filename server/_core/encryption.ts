/** 使用 AES-256-GCM 加密可还原的 API 密钥，主密钥来自运行环境。 */

import { promisify } from "node:util";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCb,
} from "node:crypto";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

const ALGO = "aes-256-gcm";
const KEY_LEN = 32; // 256-bit
const NONCE_LEN = 12; // 96 位 GCM 随机数
const TAG_LEN = 16; // 128-bit GCM tag

/** 密钥派生的固定版本盐值；更换该值会导致已有密文需要迁移。 */
const KDF_SALT = Buffer.from("yumei:key-encryption:v1");

let cachedKey: Buffer | null = null;

/** 主密钥未设置或长度不足时使用的配置错误。 */
export class EncryptionUnconfiguredError extends Error {
  /** 创建主密钥配置缺失的错误及本地生成提示。 */
  constructor() {
    super(
      "KEY_ENCRYPTION_KEY is not set. " +
        "Generate one with `openssl rand -hex 32` and add it to .env."
    );
    this.name = "EncryptionUnconfiguredError";
  }
}

/**
 * 使用 scrypt 从主密钥派生三十二字节数据密钥，并缓存在当前进程。
 *
 * @throws {@link EncryptionUnconfiguredError} 主密钥缺失或少于三十二个字符时抛出。
 */
async function getKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  const master = process.env.KEY_ENCRYPTION_KEY;
  if (!master || master.length < 32) {
    throw new EncryptionUnconfiguredError();
  }
  cachedKey = await scrypt(master, KDF_SALT, KEY_LEN);
  return cachedKey;
}

/** 清除派生密钥缓存，仅供隔离测试修改主密钥后调用。 */
export function _resetEncryptionForTests() {
  cachedKey = null;
}

/** 加密结果，包含十二字节随机 nonce、十六字节认证标签及密文字节。 */
export type EncryptedBlob = {
  /** 每次加密独立生成的十二字节随机数。 */
  nonce: Buffer;
  /** 用于校验密文完整性的十六字节 GCM 认证标签。 */
  tag: Buffer;
  /** 加密后的 UTF-8 文本字节。 */
  ciphertext: Buffer;
};

/** 使用新随机 nonce 加密 UTF-8 文本，并返回密文与认证标签。 */
export async function encrypt(plaintext: string): Promise<EncryptedBlob> {
  const key = await getKey();
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGO, key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { nonce, tag, ciphertext };
}

/** 校验认证标签后解密为 UTF-8 文本；密钥或密文不匹配时抛出错误。 */
export async function decrypt(blob: EncryptedBlob): Promise<string> {
  const key = await getKey();
  const decipher = createDecipheriv(ALGO, key, blob.nonce);
  decipher.setAuthTag(blob.tag);
  const plaintext = Buffer.concat([
    decipher.update(blob.ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** 按 nonce、认证标签、密文顺序拼接，并编码为 base64url 文本。 */
export function pack(blob: EncryptedBlob): string {
  return Buffer.concat([blob.nonce, blob.tag, blob.ciphertext]).toString(
    "base64url"
  );
}

/**
 * 从 base64url 文本拆分加密字段；数据过短时抛出错误。
 *
 * @remarks 当前要求至少一个密文字节，因此与空字符串加密结果的往返不兼容。
 */
export function unpack(packed: string): EncryptedBlob {
  const buf = Buffer.from(packed, "base64url");
  if (buf.length < NONCE_LEN + TAG_LEN + 1) {
    throw new Error("encrypted blob is too short");
  }
  return {
    nonce: buf.subarray(0, NONCE_LEN),
    tag: buf.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN),
    ciphertext: buf.subarray(NONCE_LEN + TAG_LEN),
  };
}

/** 加密文本并编码为适合数据库保存的单个字符串。 */
export async function encryptToString(plaintext: string): Promise<string> {
  return pack(await encrypt(plaintext));
}

/** 解码数据库中的密文字符串并还原明文，格式或认证错误向外传播。 */
export async function decryptFromString(packed: string): Promise<string> {
  return decrypt(unpack(packed));
}

/** 将密钥展示为前两位与后四位，中间替换为星号；短密钥全部隐藏。 */
export function maskKey(secret: string): string {
  if (secret.length <= 6) return "***";
  return `${secret.slice(0, 2)}***${secret.slice(-4)}`;
}

/** 提取密钥末四位；不足四位时返回原文本，仅用于已保存状态展示。 */
export function lastFour(secret: string): string {
  if (secret.length <= 4) return secret;
  return secret.slice(-4);
}
