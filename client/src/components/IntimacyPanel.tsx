import { intimacyMessages } from "@/locales/domain";
/** 亲密度详情侧栏，展示当前等级、升级进度和互动规则。 */

import { useI18n } from "@/lib/i18n";
import {
  INTIMACY_LEVELS,
  getLevelInfo,
  getLevelProgress,
  getLevelGradient,
  getPointsToNextLevel,
  POINTS_RULES,
} from "../../../shared/intimacy";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

/** 亲密度面板的受控开关及当前角色养成数据。 */
interface IntimacyPanelProps {
  /** 受控的展开状态，实际状态由父组件维护。 */
  open: boolean;
  /** 用户请求展开或关闭时触发，由父组件更新 open。 */
  onOpenChange: (open: boolean) => void;
  /** 当前亲密度等级，使用从 1 开始的等级编号。 */
  intimacyLevel: number;
  /** 累计经验点数，实际消费与加分由服务端决定。 */
  intimacyPoints: number;
  /** 当前连续互动天数。 */
  consecutiveDays: number;
  girlfriendName: string;
}

/** 根据服务端提供的经验与等级展示养成详情，不在组件内计算实际加分。 */
export function IntimacyPanel({
  open,
  onOpenChange,
  intimacyLevel,
  intimacyPoints,
  consecutiveDays,
  girlfriendName,
}: IntimacyPanelProps) {
  const { t } = useI18n();
  const levelInfo = getLevelInfo(intimacyLevel);
  const progress = getLevelProgress(intimacyPoints);
  const pointsToNext = getPointsToNextLevel(intimacyPoints);
  const gradient = getLevelGradient(intimacyLevel);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[340px] sm:w-[380px] p-0">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <span className="text-2xl">{levelInfo.emoji}</span>
            {t("intimacy:intimacy")}
          </SheetTitle>
          <SheetDescription>
            {t("intimacy:relationship", { name: girlfriendName })}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-6 pb-6 space-y-6">
            {/* 当前等级卡片 */}
            <div className="bg-muted/50 rounded-xl p-5 text-center space-y-3">
              <div className="text-5xl">{levelInfo.emoji}</div>
              <div>
                <h3 className={`text-2xl font-bold ${levelInfo.color}`}>
                  {t("common:lv")}
                  {levelInfo.level} {t(intimacyMessages[levelInfo.level].name)}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t(intimacyMessages[levelInfo.level].description)}
                </p>
              </div>

              {/* 进度条 */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {intimacyPoints} {t("intimacy:xp")}
                  </span>
                  <span>
                    {pointsToNext !== null
                      ? t("common:xpToNextLevel", { points: pointsToNext })
                      : t("common:maxLevel")}
                  </span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* 统计数据 */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-background rounded-lg p-3">
                  <p className="text-2xl font-bold text-primary">
                    {consecutiveDays}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("intimacy:consecutiveDaysTogether")}
                  </p>
                </div>
                <div className="bg-background rounded-lg p-3">
                  <p className="text-2xl font-bold text-primary">
                    {intimacyPoints}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("intimacy:totalXP")}
                  </p>
                </div>
              </div>
            </div>

            {/* 称呼变化 */}
            {levelInfo.petName !== "你" && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
                <p className="text-sm">
                  {t("intimacy:nickname", {
                    name: t(intimacyMessages[levelInfo.level].petName),
                  })}
                </p>
              </div>
            )}

            {/* 已解锁内容 */}
            <div>
              <h4 className="font-semibold text-sm mb-3">
                {t("intimacy:unlockedFeatures")}
              </h4>
              <div className="space-y-2">
                {INTIMACY_LEVELS.filter(l => l.level <= intimacyLevel).map(
                  l => (
                    <div key={l.level} className="flex items-start gap-2">
                      <span className="text-sm flex-shrink-0">{l.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">
                          {t("common:lv")}
                          {l.level} {t(intimacyMessages[l.level].name)}
                        </p>
                        {l.unlocks.map((u, i) => (
                          <p key={i} className="text-xs text-muted-foreground">
                            {t(intimacyMessages[l.level].unlocks[i])}
                          </p>
                        ))}
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-[10px] flex-shrink-0"
                      >
                        {t("intimacy:unlocked")}
                      </Badge>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* 未解锁内容 */}
            {intimacyLevel < 10 && (
              <div>
                <h4 className="font-semibold text-sm mb-3 text-muted-foreground">
                  {t("intimacy:locked")}
                </h4>
                <div className="space-y-2 opacity-60">
                  {INTIMACY_LEVELS.filter(l => l.level > intimacyLevel).map(
                    l => (
                      <div key={l.level} className="flex items-start gap-2">
                        <span className="text-sm flex-shrink-0">🔒</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">
                            {t("intimacy:lockedLevel", {
                              level: l.level,
                              name: t(intimacyMessages[l.level].name),
                              points: l.requiredPoints,
                            })}
                          </p>
                          {l.unlocks.map((u, i) => (
                            <p
                              key={i}
                              className="text-xs text-muted-foreground"
                            >
                              {t(intimacyMessages[l.level].unlocks[i])}
                            </p>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* 经验值获取方式 */}
            <div>
              <h4 className="font-semibold text-sm mb-3">
                {t("intimacy:howToEarnXP")}
              </h4>
              <div className="space-y-1.5">
                {Object.values(POINTS_RULES).map(rule => (
                  <div
                    key={rule.type}
                    className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2"
                  >
                    <span className="text-muted-foreground">
                      {rule.type === "text_message" &&
                        t("intimacy:sendATextMessage")}
                      {rule.type === "voice_message" &&
                        t("intimacy:sendAVoiceMessage")}
                      {rule.type === "selfie" && t("intimacy:generateASelfie")}
                      {rule.type === "daily_first" &&
                        t("intimacy:firstInteractionOfTheDay")}
                      {rule.type === "edit_profile" &&
                        t("intimacy:editCompanionProfile")}
                      {rule.type === "long_conversation" &&
                        t("intimacy:haveADeeperConversation")}
                      {rule.type === "night_chat" && t("intimacy:chatAtNight")}
                    </span>
                    <span className="font-medium text-primary">
                      +{rule.basePoints}
                      {rule.bonusPoints
                        ? ` ~ +${rule.basePoints + rule.bonusPoints}`
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                {t("intimacy:upTo200XPPerDayDecaysAfter")}
              </p>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
