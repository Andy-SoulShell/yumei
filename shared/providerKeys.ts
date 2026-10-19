/** 前后端共用的 Provider 密钥名称与基本格式校验。 */

/** 可持久化的用户 BYOK 密钥类型，与环境变量映射保持一致。 */
export const KEY_NAMES = [
  "openrouter", // OpenRouter 聊天
  "fal", // 图像生成
  "elevenlabs", // ElevenLabs 语音合成
  "fish-audio", // Fish Audio 语音合成
  "openai", // OpenAI Whisper 语音转写
] as const;

/** 受支持 Provider 密钥的稳定名称。 */
export type KeyName = (typeof KEY_NAMES)[number];

/** 只校验字符、长度和前缀；通过不代表密钥已经过服务端认证。 */
export function assertProviderKeyFormat(name: KeyName, value: string): void {
  const trimmed = value.trim();
  if (trimmed !== value) {
    throw new Error("Key contains leading/trailing whitespace");
  }
  if (trimmed.length > 500) throw new Error("Key is too long");
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
      // fal 密钥允许基本标识符，或以冒号连接的标识符与密文。
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
