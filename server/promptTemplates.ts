/** 自拍场景分类和英文提示词构建。原始提示词来源： https://github.com/SumeLabs/clawra 。 */

// ============================================
// 类型定义
// ============================================

/** 自拍模式：mirror 为镜子自拍，direct 为直拍，auto 按场景关键词自动判断。 */
export type SelfieMode = "mirror" | "direct" | "auto";

/** 构建自拍提示词的用户场景和可选模式。 */
export interface PromptOptions {
  /** 用户描述的场景/上下文 */
  userContext: string;
  /** 不传时默认 auto，由场景关键词选择镜子或直拍模式。 */
  mode?: SelfieMode;
}

/** 最终提示词、实际使用的模式及原始场景。 */
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

/** 优先匹配地点、特写等直拍关键词，其次匹配镜子关键词，无法分类时回退为镜子模式。 */
export function detectMode(userContext: string): "mirror" | "direct" {
  // Mirror 模式关键词：服装、穿搭、全身照相关
  const mirrorKeywords =
    /outfit|wearing|clothes|dress|suit|fashion|full-body|mirror/i;

  // Direct 模式关键词：地点、特写、表情相关
  const directKeywords =
    /cafe|restaurant|beach|park|city|close-up|portrait|face|eyes|smile/i;

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

/** 将用户场景拼入镜子自拍模板。 */
export function buildMirrorPrompt(userContext: string): string {
  return `make a pic of this person, but ${userContext}. the person is taking a mirror selfie`;
}

/** 将用户场景拼入直拍自拍模板。 */
export function buildDirectPrompt(userContext: string): string {
  return `a close-up selfie taken by herself at ${userContext}, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible`;
}

// ============================================
// 统一接口
// ============================================

/** 根据给定或自动推断的模式生成提示词文本。 */
export function buildPrompt(
  userContext: string,
  mode: "mirror" | "direct"
): string {
  if (mode === "direct") {
    return buildDirectPrompt(userContext);
  }
  return buildMirrorPrompt(userContext);
}

/** 根据场景与模式生成提示词，并返回实际模式和原始输入。 */
export function buildSmartPrompt(options: PromptOptions): PromptResult {
  const { userContext, mode = "auto" } = options;

  // 确定实际使用的模式
  const actualMode = mode === "auto" ? detectMode(userContext) : mode;

  // 构建提示词
  const prompt = buildPrompt(userContext, actualMode);

  return {
    prompt,
    mode: actualMode,
    userContext,
  };
}

// ============================================
// 关键词参考表
// ============================================

/** 镜子自拍场景的关键词，供展示或调用方复用。 */
export const MIRROR_MODE_KEYWORDS = [
  // 服装相关
  "outfit",
  "wearing",
  "clothes",
  "dress",
  "suit",
  "fashion",
  "shirt",
  "pants",
  "skirt",
  "jacket",
  "coat",
  "shoes",

  // 风格相关
  "casual",
  "formal",
  "sporty",
  "elegant",
  "vintage",

  // 拍摄方式
  "full-body",
  "mirror",
  "reflection",

  // 中文关键词
  "穿着",
  "服装",
  "搭配",
  "造型",
  "镜子",
  "全身",
] as const;

/** 直拍自拍场景的关键词，供展示或调用方复用。 */
export const DIRECT_MODE_KEYWORDS = [
  // 地点相关
  "cafe",
  "restaurant",
  "beach",
  "park",
  "city",
  "home",
  "office",
  "gym",
  "library",
  "street",
  "mountain",
  "lake",

  // 拍摄方式
  "close-up",
  "portrait",
  "selfie",

  // 表情/特征
  "face",
  "eyes",
  "smile",
  "expression",
  "look",

  // 时间/氛围
  "morning",
  "evening",
  "sunset",
  "night",
  "cozy",
  "warm",

  // 中文关键词
  "咖啡厅",
  "餐厅",
  "海边",
  "公园",
  "城市",
  "家里",
  "特写",
  "肖像",
  "表情",
  "微笑",
] as const;

// ============================================
// 使用示例
// ============================================

/** 提示词构建的静态示例，便于理解模式与场景的组合。 */
export const USAGE_EXAMPLES = {
  // Mirror 模式示例
  mirror: [
    {
      input: "wearing a red dress",
      expectedMode: "mirror" as const,
      prompt: buildSmartPrompt({ userContext: "wearing a red dress" }).prompt,
    },
    {
      input: "in a business suit",
      expectedMode: "mirror" as const,
      prompt: buildSmartPrompt({ userContext: "in a business suit" }).prompt,
    },
    {
      input: "casual streetwear outfit",
      expectedMode: "mirror" as const,
      prompt: buildSmartPrompt({ userContext: "casual streetwear outfit" })
        .prompt,
    },
  ],

  // Direct 模式示例
  direct: [
    {
      input: "at a cozy cafe with warm lighting",
      expectedMode: "direct" as const,
      prompt: buildSmartPrompt({
        userContext: "at a cozy cafe with warm lighting",
      }).prompt,
    },
    {
      input: "at the beach during sunset",
      expectedMode: "direct" as const,
      prompt: buildSmartPrompt({ userContext: "at the beach during sunset" })
        .prompt,
    },
    {
      input: "in the park on a sunny day",
      expectedMode: "direct" as const,
      prompt: buildSmartPrompt({ userContext: "in the park on a sunny day" })
        .prompt,
    },
  ],
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
  USAGE_EXAMPLES,
};
