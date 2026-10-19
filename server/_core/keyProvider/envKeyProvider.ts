/** 从环境读取运营方密钥，从加密数据库记录读取用户 BYOK 密钥。 */

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { userKeys } from "../../../drizzle/schema";
import { getDb } from "../../database";
import {
  lastFour as computeLastFour,
  decryptFromString,
  encryptToString,
} from "../encryption";
import {
  KEY_NAMES,
  type KeyDescription,
  type KeyName,
  type KeyProvider,
  type KeyScope,
  type ResolvedKey,
} from "./types";

/** Provider 名称到运营方环境变量的固定映射。 */

const OPERATOR_ENV: Record<KeyName, string> = {
  openrouter: "OPERATOR_OPENROUTER_KEY",
  fal: "OPERATOR_FAL_KEY",
  elevenlabs: "OPERATOR_ELEVENLABS_KEY",
  "fish-audio": "OPERATOR_FISH_AUDIO_KEY",
  openai: "OPERATOR_OPENAI_KEY",
};

/** 优先解密用户 BYOK，缺少用户配置时回退为对应运营方环境变量。 */
export class EnvKeyProvider implements KeyProvider {
  /** 按用户 BYOK 优先、运营方默认其次的顺序解析明文，均未配置时返回 null。 */
  async get(scope: KeyScope, name: KeyName): Promise<string | null> {
    return (await this.resolve(scope, name)).value;
  }

  /** 将明文和来源一起返回，避免密钥变更期间按过期元数据豁免计量。 */
  async resolve(scope: KeyScope, name: KeyName): Promise<ResolvedKey> {
    if (scope !== "operator") {
      const value = await readUserKey(scope.userId, name);
      if (value) return { value, source: "user" };
    }
    const value = readOperatorKey(name);
    return { value, source: value ? "operator" : "none" };
  }

  /** 加密保存用户密钥并更新末四位展示信息，空密钥或不支持的名称会被拒绝。 */
  async setUserKey(
    userId: string,
    name: KeyName,
    plaintext: string
  ): Promise<void> {
    // 先校验输入，再访问数据库，使无数据库环境也能获得明确的格式错误。
    if (!plaintext) {
      throw new Error("Cannot store an empty key. Use clearUserKey instead.");
    }
    if (!KEY_NAMES.includes(name)) {
      throw new Error(`Unknown key name: ${name}`);
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const encryptedValue = await encryptToString(plaintext);
    const lastFour = computeLastFour(plaintext);

    // 以用户和密钥名称为唯一组合，冲突时更新已有密文。
    await db
      .insert(userKeys)
      .values({ userId, name, encryptedValue, lastFour })
      .onDuplicateKeyUpdate({
        set: { encryptedValue, lastFour },
      });
  }

  /** 按用户和 Provider 删除 BYOK；后续请求将回退到运营方配置。 */
  async clearUserKey(userId: string, name: KeyName): Promise<void> {
    const db = await getDb();
    if (!db) return; // silent no-op in test mode (no DB)
    await db
      .delete(userKeys)
      .where(and(eq(userKeys.userId, userId), eq(userKeys.name, name)));
  }

  /** 列出支持密钥的设置状态、末四位和记录创建时间，不解密完整值。 */
  async describeUserKeys(
    userId: string
  ): Promise<Record<KeyName, KeyDescription>> {
    const db = await getDb();
    const result: Record<KeyName, KeyDescription> = {} as any;
    for (const n of KEY_NAMES) {
      result[n] = { isSet: false, lastFour: null, setAt: null };
    }

    if (!db) return result;

    const rows = await db
      .select()
      .from(userKeys)
      .where(eq(userKeys.userId, userId));

    for (const row of rows) {
      const n = row.name as KeyName;
      if (!KEY_NAMES.includes(n)) continue;
      result[n] = {
        isSet: true,
        lastFour: row.lastFour ?? null,
        setAt: row.createdAt ?? null,
      };
    }
    return result;
  }
}

// 密钥存储与解密辅助函数。

/** 读取指定 Provider 的运营方环境变量，空值返回 null。 */
function readOperatorKey(name: KeyName): string | null {
  const envVar = OPERATOR_ENV[name];
  const value = process.env[envVar];
  return value && value.length > 0 ? value : null;
}

/** 读取并解密用户密钥；无记录返回 null，解密失败提示重新保存并禁止回退运营方。 */
async function readUserKey(
  userId: string,
  name: KeyName
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const row = await db
    .select({ encryptedValue: userKeys.encryptedValue })
    .from(userKeys)
    .where(and(eq(userKeys.userId, userId), eq(userKeys.name, name)))
    .limit(1);

  if (!row[0]) return null;

  try {
    return await decryptFromString(row[0].encryptedValue);
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `BYOK_KEY_UNREADABLE: 请重新保存 ${name} API 密钥`,
    });
  }
}

/** 供业务模块共享的默认环境变量与数据库密钥解析实例。 */
export const keyProvider: KeyProvider = new EnvKeyProvider();
