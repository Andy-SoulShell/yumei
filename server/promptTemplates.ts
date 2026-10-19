/**
 * Clawra Selfie Prompt Templates and Logic
 * 
 * 这个文件包含了 Clawra 项目的核心提示词工程逻辑
 * 可以直接集成到任何 TypeScript/JavaScript 项目中
 * 
 * 来源：https://github.com/SumeLabs/clawra
 */

// ============================================
// 类型定义
// ============================================

/**
 * 自拍模式
 * - mirror: 镜子自拍（适合全身照、服装展示）
 * - direct: 直接自拍（适合特写、地点拍摄）
 * - auto: 自动检测模式
 */
export type SelfieMode = "mirror" | "direct" | "auto";

/**
 * 提示词构建选项
 */
export interface PromptOptions {
  /** 用户描述的场景/上下文 */
  userContext: string;
  /** 自拍模式 */
  mode?: SelfieMode;
}

/**
 * 提示词构建结果
 */
export interface PromptResult {
  /** 完整的提示词 */
  prompt: string;
  /** 使用的模式 */
  mode: "mirror" | "direct";
  /** 原始用户输入 */
  userContext: string;
}

// ============================================
// 模式检测逻辑
// ============================================

/**
 * 根据用户输入的关键词自动检测应该使用哪种自拍模式
 * 
 * @param userContext - 用户描述的场景
 * @returns "mirror" 或 "direct"
 * 
 * @example
 * detectMode("wearing a red dress") // 返回 "mirror"
 * detectMode("at a cozy cafe") // 返回 "direct"
 */
export function detectMode(userContext: string): "mirror" | "direct" {
  // Mirror 模式关键词：服装、穿搭、全身照相关
  const mirrorKeywords = /outfit|wearing|clothes|dress|suit|fashion|full-body|mirror/i;
  
  // Direct 模式关键词：地点、特写、表情相关
  const directKeywords = /cafe|restaurant|beach|park|city|close-up|portrait|face|eyes|smile/i;

  // 优先检测 direct 模式（因为更具体）
  if (directKeywords.test(userContext)) {
    return "direct";
  }
  
  // 然后检测 mirror 模式
  if (mirrorKeywords.test(userContext)) {
    return "mirror";
  }
  
  // 默认使用 mirror 模式
  return "mirror";
}

// ============================================
// 提示词模板
// ============================================

/**
 * Mirror Selfie 提示词模板
 * 
 * 适用场景：
 * - 服装展示（outfit, wearing, clothes, dress, suit, fashion）
 * - 全身照（full-body）
 * - 镜子自拍（mirror）
 * 
 * 特点：
 * - 强调"镜子自拍"的特征
 * - 适合展示穿搭和整体造型
 * - 通常包含更多环境信息
 * 
 * @param userContext - 用户描述的场景
 * @returns 完整的提示词
 * 
 * @example
 * buildMirrorPrompt("wearing a red dress")
 * // 返回: "make a pic of this person, but wearing a red dress. the person is taking a mirror selfie"
 */
export function buildMirrorPrompt(userContext: string): string {
  return `make a pic of this person, but ${userContext}. the person is taking a mirror selfie`;
}

/**
 * Direct Selfie 提示词模板
 * 
 * 适用场景：
 * - 地点拍摄（cafe, restaurant, beach, park, city）
 * - 特写肖像（close-up, portrait, face）
 * - 表情展示（eyes, smile）
 * 
 * 特点：
 * - 强调"直接眼神接触"
 * - 适合展示面部表情和环境
 * - 更自然的自拍角度
 * 
 * @param userContext - 用户描述的场景
 * @returns 完整的提示词
 * 
 * @example
 * buildDirectPrompt("a cozy cafe with warm lighting")
 * // 返回: "a close-up selfie taken by herself at a cozy cafe with warm lighting, direct eye contact..."
 */
export function buildDirectPrompt(userContext: string): string {
  return `a close-up selfie taken by herself at ${userContext}, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible`;
}

// ============================================
// 统一接口
// ============================================

/**
 * 根据模式构建提示词
 * 
 * @param userContext - 用户描述的场景
 * @param mode - 自拍模式（"mirror" 或 "direct"）
 * @returns 完整的提示词
 * 
 * @example
 * buildPrompt("wearing a hat", "mirror")
 * buildPrompt("at the beach", "direct")
 */
export function buildPrompt(userContext: string, mode: "mirror" | "direct"): string {
  if (mode === "direct") {
    return buildDirectPrompt(userContext);
  }
  return buildMirrorPrompt(userContext);
}

/**
 * 智能构建提示词（推荐使用）
 * 
 * 这是最高级的接口，会自动检测模式并构建提示词
 * 
 * @param options - 提示词构建选项
 * @returns 提示词构建结果
 * 
 * @example
 * // 自动检测模式
 * const result = buildSmartPrompt({ userContext: "wearing a red dress" });
 * console.log(result.mode); // "mirror"
 * console.log(result.prompt); // "make a pic of this person, but wearing a red dress..."
 * 
 * // 手动指定模式
 * const result = buildSmartPrompt({ 
 *   userContext: "casual style", 
 *   mode: "direct" 
 * });
 */
export function buildSmartPrompt(options: PromptOptions): PromptResult {
  const { userContext, mode = "auto" } = options;
  
  // 确定实际使用的模式
  const actualMode = mode === "auto" ? detectMode(userContext) : mode;
  
  // 构建提示词
  const prompt = buildPrompt(userContext, actualMode);
  
  return {
    prompt,
    mode: actualMode,
    userContext
  };
}

// ============================================
// 关键词参考表
// ============================================

/**
 * Mirror 模式关键词参考
 * 
 * 当用户输入包含这些关键词时，建议使用 Mirror 模式
 */
export const MIRROR_MODE_KEYWORDS = [
  // 服装相关
  "outfit", "wearing", "clothes", "dress", "suit", "fashion",
  "shirt", "pants", "skirt", "jacket", "coat", "shoes",
  
  // 风格相关
  "casual", "formal", "sporty", "elegant", "vintage",
  
  // 拍摄方式
  "full-body", "mirror", "reflection",
  
  // 中文关键词
  "穿着", "服装", "搭配", "造型", "镜子", "全身"
] as const;

/**
 * Direct 模式关键词参考
 * 
 * 当用户输入包含这些关键词时，建议使用 Direct 模式
 */
export const DIRECT_MODE_KEYWORDS = [
  // 地点相关
  "cafe", "restaurant", "beach", "park", "city", "home",
  "office", "gym", "library", "street", "mountain", "lake",
  
  // 拍摄方式
  "close-up", "portrait", "selfie",
  
  // 表情/特征
  "face", "eyes", "smile", "expression", "look",
  
  // 时间/氛围
  "morning", "evening", "sunset", "night", "cozy", "warm",
  
  // 中文关键词
  "咖啡厅", "餐厅", "海边", "公园", "城市", "家里",
  "特写", "肖像", "表情", "微笑"
] as const;

// ============================================
// 使用示例
// ============================================

/**
 * 使用示例集合
 */
export const USAGE_EXAMPLES = {
  // Mirror 模式示例
  mirror: [
    {
      input: "wearing a red dress",
      expectedMode: "mirror" as const,
      prompt: buildSmartPrompt({ userContext: "wearing a red dress" }).prompt
    },
    {
      input: "in a business suit",
      expectedMode: "mirror" as const,
      prompt: buildSmartPrompt({ userContext: "in a business suit" }).prompt
    },
    {
      input: "casual streetwear outfit",
      expectedMode: "mirror" as const,
      prompt: buildSmartPrompt({ userContext: "casual streetwear outfit" }).prompt
    }
  ],
  
  // Direct 模式示例
  direct: [
    {
      input: "at a cozy cafe with warm lighting",
      expectedMode: "direct" as const,
      prompt: buildSmartPrompt({ userContext: "at a cozy cafe with warm lighting" }).prompt
    },
    {
      input: "at the beach during sunset",
      expectedMode: "direct" as const,
      prompt: buildSmartPrompt({ userContext: "at the beach during sunset" }).prompt
    },
    {
      input: "in the park on a sunny day",
      expectedMode: "direct" as const,
      prompt: buildSmartPrompt({ userContext: "in the park on a sunny day" }).prompt
    }
  ]
} as const;

// ============================================
// 导出所有内容
// ============================================

export default {
  // 核心函数
  detectMode,
  buildPrompt,
  buildMirrorPrompt,
  buildDirectPrompt,
  buildSmartPrompt,
  
  // 关键词参考
  MIRROR_MODE_KEYWORDS,
  DIRECT_MODE_KEYWORDS,
  
  // 使用示例
  USAGE_EXAMPLES
};
