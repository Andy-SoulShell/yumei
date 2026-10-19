/** Provider 密钥的服务端解析、保存与脱敏展示约定。 */

import type { KeyName } from "../../../shared/providerKeys";
export { KEY_NAMES } from "../../../shared/providerKeys";
export type { KeyName } from "../../../shared/providerKeys";

/** 密钥解析范围：仅运营方，或指定用户并允许回退到运营方。 */
export type KeyScope = "operator" | { userId: string };

/** 客户端可读取的密钥设置状态，不包含完整明文。 */
export type KeyDescription = {
  /** 用户是否保存了该 Provider 的 BYOK，不代表运营方是否配置。 */
  isSet: boolean;
  /** 保存密钥的末四位；没有用户配置时为 null。 */
  lastFour: string | null;
  /** 当前实现返回密钥记录创建时间；轮换密钥后该值不会同步更新。 */
  setAt: Date | null;
};

/** 实际解析出的凭据与来源，计量必须使用来源而不是“已保存”标记。 */
export type ResolvedKey = {
  value: string | null;
  source: "user" | "operator" | "none";
};

/** 运营方默认密钥和用户加密 BYOK 密钥的访问契约。 */
export interface KeyProvider {
  /** 在同一次解析中返回凭据与来源；已保存密钥无法解密时拒绝回退。 */
  resolve(scope: KeyScope, name: KeyName): Promise<ResolvedKey>;

  /** 按范围解析明文；用户范围允许回退运营方，完全未配置时返回 null。 */
  get(scope: KeyScope, name: KeyName): Promise<string | null>;

  /** 将用户明文加密后保存，同 Provider 已有密钥会被替换。 */
  setUserKey(userId: string, name: KeyName, plaintext: string): Promise<void>;

  /** 删除用户在指定 Provider 下的 BYOK 配置。 */
  clearUserKey(userId: string, name: KeyName): Promise<void>;

  /** 返回可安全发送到前端的密钥状态，不返回完整明文。 */
  describeUserKeys(userId: string): Promise<Record<KeyName, KeyDescription>>;
}
