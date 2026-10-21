/** 为官方角色初始种子生成表达方式和示例，运行时使用数据库中的行为配置。 */
import { getCharacterPreset } from "./characterPresets";
import {
  resolveCompanionBehavior,
  type CompanionBehavior,
} from "../../shared/companionBehavior";

/** 按已存在的预设选择表达与示例，未知预设返回稳定默认。 */
export function getPresetBehavior(id: string): CompanionBehavior {
  const preset = getCharacterPreset(id);
  if (!preset) return resolveCompanionBehavior(null);
  const reserved = ["kirika", "tsuki", "shiori", "shiyu", "yuehe"].includes(id);
  const lively = ["xiaotao", "momoka", "aoi", "ningning", "hikari"].includes(
    id
  );
  const direct = ["xiawei", "suwan", "misaki", "kaede", "linxi"].includes(id);
  return resolveCompanionBehavior({
    expression: reserved
      ? "reserved"
      : lively
        ? "playful"
        : direct
          ? "direct"
          : "warm",
    verbosity: reserved || direct ? "concise" : "balanced",
    initiative: lively ? "lively" : reserved ? "quiet" : "balanced",
    examples: [
      {
        user: "今天想聊点轻松的。",
        assistant: `${preset.tagline} 你想先听听，还是说说你的今天？`,
      },
      {
        user: "你平时喜欢做什么？",
        assistant: `最近常把时间留给${preset.interests.split("、")[0]}。${reserved ? "慢慢来，不赶时间。" : "你有没有想一起试试的？"}`,
      },
    ],
  });
}
