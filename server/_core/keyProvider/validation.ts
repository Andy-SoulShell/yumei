/** 在保存 BYOK 密钥之前检查基本格式，不发起真实供应商验证请求。 */

import type { KeyName } from "./types";

/**
 * 校验密钥的空白、长度和 Provider 前缀，失败时抛出可展示的错误。
 *
 * @remarks 格式通过不代表密钥有效、账户有余额或具备模型权限。
 */
export async function validateProviderKey(
  name: KeyName,
  value: string
): Promise<void> {
  const trimmed = value.trim();
  if (trimmed !== value) {
    throw new Error("Key contains leading/trailing whitespace");
  }
  if (trimmed.length < 8) {
    throw new Error("Key looks too short for any provider");
  }

  switch (name) {
    case "openrouter":
      // 这里只检查 OpenRouter 密钥前缀和长度，不发起认证请求。
      if (!/^sk-or-/.test(trimmed)) {
        throw new Error(
          "OpenRouter keys start with `sk-or-` — check that you copied the right one"
        );
      }
      break;
    case "openai":
      if (!/^sk-/.test(trimmed)) {
        throw new Error("OpenAI keys start with `sk-`");
      }
      break;
    case "fal":
      // fal 密钥要求包含冒号分隔符。
      if (!/^[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?$/.test(trimmed)) {
        throw new Error(
          "fal.ai keys are usually `id:secret`; the value you provided doesn't match"
        );
      }
      break;
    case "elevenlabs":
      // ElevenLabs 令牌仅做基本长度校验。
      if (trimmed.length < 20) {
        throw new Error("ElevenLabs keys are typically 20+ characters");
      }
      break;
    case "fish-audio":
      // Fish Audio 令牌仅做基本长度校验。
      if (trimmed.length < 16) {
        throw new Error("Fish Audio keys are typically 16+ characters");
      }
      break;
    default: {
      // 新增密钥名称但遗漏分支时，通过 never 收窄产生编译错误。
      const _exhaustive: never = name;
      void _exhaustive;
    }
  }
}
