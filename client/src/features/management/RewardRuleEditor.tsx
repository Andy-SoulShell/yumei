/** 按触发条件、积分结果、发放限制编辑奖励，避免无意义阈值。 */
import type { ProductConfig, RewardAction } from "@shared/productConfig";
import { ConfigForm, type FormSchema } from "./ConfigForm";

export function rewardCondition(
  action: string,
  rule: ProductConfig["intimacy"]["rules"][RewardAction],
  config: ProductConfig
) {
  switch (action) {
    case "text_message":
      return `文字至少 ${config.intimacy.minimumTextLength} 字符才有效；超过 ${rule.bonusThreshold} 字符时再加 ${rule.bonusPoints} 分。`;
    case "voice_message":
      return `成功发送语音奖励基础分；时长超过 ${Number(rule.bonusThreshold) / 1000} 秒时再加 ${rule.bonusPoints} 分。`;
    case "selfie":
      return `成功生成自拍奖励基础分；当天首次自拍再加 ${rule.bonusPoints} 分。`;
    case "daily_first":
      return `当天首次有效互动额外结算；连续互动达到 ${rule.bonusThreshold} 天时再加 ${rule.bonusPoints} 分。`;
    case "edit_profile":
      return `资料编辑奖励基础分；本次补全资料时再加 ${rule.bonusPoints} 分。`;
    case "long_conversation":
      return `成功聊天恰好达到第 ${Number(rule.bonusThreshold) + 1} 轮时触发，结算基础分加额外分。`;
    case "night_chat":
      return `在 ${config.intimacy.night.timeZone} 的 ${config.intimacy.night.startHour}:00–${config.intimacy.night.endHour}:00 之间有效互动，额外结算基础分；此项没有额外分。`;
    default:
      return "";
  }
}
export function RewardRuleEditor({
  action,
  value,
  schema,
  config,
  path,
  issues,
  disabled,
  onChange,
}: {
  action: string;
  value: ProductConfig["intimacy"]["rules"][RewardAction];
  schema?: FormSchema;
  config: ProductConfig;
  path: string;
  issues: Record<string, string>;
  disabled: boolean;
  onChange: (next: unknown) => void;
}) {
  const fields = (keys: string[]) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {keys.map(key => (
        <ConfigForm
          key={key}
          flat
          value={(value as Record<string, unknown>)[key]}
          schema={schema?.properties?.[key]}
          path={`${path}.${key}`}
          issues={issues}
          disabled={disabled}
          onChange={next => onChange({ ...value, [key]: next })}
        />
      ))}
    </div>
  );
  return (
    <div className="space-y-5">
      {fields(["enabled", "label"])}
      <p
        aria-live="polite"
        className="rounded-xl bg-primary/5 p-4 text-sm leading-6"
      >
        <strong>
          {value.enabled ? "触发条件：" : "此奖励已停用；重新启用后："}
        </strong>
        {rewardCondition(action, value, config)}
      </p>
      <section className="space-y-3">
        <h4 className="text-sm font-medium">满足条件，会得到多少分</h4>
        {fields([
          "basePoints",
          ...(action === "night_chat" ? [] : ["bonusPoints"]),
          ...([
            "text_message",
            "voice_message",
            "daily_first",
            "long_conversation",
          ].includes(action)
            ? ["bonusThreshold"]
            : []),
        ])}
      </section>
      <section className="space-y-3">
        <h4 className="text-sm font-medium">满足条件之后，还要通过发放限制</h4>
        <p className="text-xs leading-5 text-muted-foreground">
          先检查冷却与单项次数，再将本次主奖励、每日首次和夜间奖励合并检查每日{" "}
          {config.intimacy.dailyPointsLimit} 分上限。剩余额度不足时整组不发放。
        </p>
        {fields([
          "cooldownMinutes",
          ...(action === "daily_first" ? [] : ["dailyLimit"]),
        ])}
        {action === "daily_first" && (
          <p className="text-xs text-muted-foreground">
            每日首次互动每天最多奖励 1 次。
          </p>
        )}
      </section>
    </div>
  );
}
