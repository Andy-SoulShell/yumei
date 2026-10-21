/** 本次图片描述优先；参考图和角色外貌只提供未指定的人物细节。 */

import type { SelfiePose } from "../shared/selfiePoses";
import type { ImageGenerationMode } from "./_core/comfyui";

export const IMAGE_PROMPT_VERSION = "companion-media/2";

/** 构建单人图片提示词，不接受聊天历史、关系或情绪作为画面条件。 */
export function buildImagePrompt(options: {
  userContext: string;
  generationMode: ImageGenerationMode;
  appearance: string;
  pose?: SelfiePose;
}): { prompt: string; mode: "mirror" | "direct" } {
  const request = options.userContext.trim();
  // 预设姿势只在没有文字时兜底，避免和用户的构图、表情等要求冲突。
  const scene = request || options.pose?.promptFragment || "一张自然的人物照片";
  const identity =
    options.generationMode === "reference"
      ? "以参考图中的人物身份为基础生成图片。服装、场景、姿势、表情、构图、拍摄方式和画风均以本次画面要求为准。"
      : `按本次画面要求生成图片。角色外貌参考仅补充本次未指定的细节，冲突时以本次要求为准。\n角色外貌参考：${options.appearance}`;
  return {
    prompt: `${identity}\n\n本次画面要求：\n${scene}`,
    // 沿用相册的历史构图标签；它不再决定提示词或强制自拍。
    mode: !request && options.pose?.mode === "mirror" ? "mirror" : "direct",
  };
}

/** 合照同样只使用本次描述，两个参考图仅提供人物身份。 */
export function buildCoupleImagePrompt(
  userContext: string | undefined
): string {
  return `两张参考图分别提供两个人物的身份。按本次画面要求生成两人同框的图片，服装、场景、姿势、表情、构图、拍摄方式和画风均以本次要求为准。\n\n本次画面要求：\n${userContext?.trim() || "两人自然合照"}`;
}
