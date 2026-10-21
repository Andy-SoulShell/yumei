/** 本次图片描述优先；参考图和角色外貌只提供未指定的人物细节。 */

import type { SelfiePose } from "../shared/selfiePoses";
import type { ImageGenerationMode } from "./_core/comfyui";
import type { ProductConfig } from "../shared/productConfig";
import { renderPrompt } from "../shared/aiConfig";

/** 构建单人图片提示词，不接受聊天历史、关系或情绪作为画面条件。 */
export function buildImagePrompt(
  config: ProductConfig,
  options: {
    userContext: string;
    generationMode: ImageGenerationMode;
    appearance: string;
    pose?: SelfiePose;
  }
): { prompt: string; mode: "mirror" | "direct" } {
  const request = options.userContext.trim();
  // 预设姿势只在没有文字时兜底，避免和用户的构图、表情等要求冲突。
  const scene =
    request ||
    options.pose?.promptFragment ||
    config.prompts.image.defaultScene;
  return {
    prompt: renderPrompt(config.prompts.image[options.generationMode], {
      scene,
      appearance: options.appearance,
    }),
    // 沿用相册的历史构图标签；它不再决定提示词或强制自拍。
    mode: !request && options.pose?.mode === "mirror" ? "mirror" : "direct",
  };
}

/** 合照同样只使用本次描述，两个参考图仅提供人物身份。 */
export function buildCoupleImagePrompt(
  config: ProductConfig,
  userContext: string | undefined
): string {
  return renderPrompt(config.prompts.image.couple, {
    scene: userContext?.trim() || config.prompts.image.defaultCoupleScene,
  });
}
