import {
  INTIMACY_LEVELS,
  getLevelInfo,
  getLevelProgress,
  getLevelGradient,
  getPointsToNextLevel,
  POINTS_RULES,
} from "../../../shared/intimacy";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface IntimacyPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intimacyLevel: number;
  intimacyPoints: number;
  consecutiveDays: number;
  girlfriendName: string;
}

export function IntimacyPanel({
  open,
  onOpenChange,
  intimacyLevel,
  intimacyPoints,
  consecutiveDays,
  girlfriendName,
}: IntimacyPanelProps) {
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
            亲密度详情
          </SheetTitle>
          <SheetDescription>
            你与 {girlfriendName} 的关系
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="px-6 pb-6 space-y-6">
            {/* 当前等级卡片 */}
            <div className="bg-muted/50 rounded-xl p-5 text-center space-y-3">
              <div className="text-5xl">{levelInfo.emoji}</div>
              <div>
                <h3 className={`text-2xl font-bold ${levelInfo.color}`}>
                  Lv.{levelInfo.level} {levelInfo.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">{levelInfo.description}</p>
              </div>

              {/* 进度条 */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{intimacyPoints} 经验值</span>
                  <span>
                    {pointsToNext !== null ? `还需 ${pointsToNext} 升级` : "已满级 ✨"}
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
                  <p className="text-2xl font-bold text-primary">{consecutiveDays}</p>
                  <p className="text-xs text-muted-foreground">连续互动天数</p>
                </div>
                <div className="bg-background rounded-lg p-3">
                  <p className="text-2xl font-bold text-primary">{intimacyPoints}</p>
                  <p className="text-xs text-muted-foreground">总经验值</p>
                </div>
              </div>
            </div>

            {/* 称呼变化 */}
            {levelInfo.petName !== "你" && (
              <div className="bg-pink-500/5 border border-pink-500/20 rounded-lg p-3 text-center">
                <p className="text-sm">
                  她现在叫你 <span className="font-bold text-pink-500">「{levelInfo.petName}」</span>
                </p>
              </div>
            )}

            {/* 已解锁内容 */}
            <div>
              <h4 className="font-semibold text-sm mb-3">已解锁内容</h4>
              <div className="space-y-2">
                {INTIMACY_LEVELS.filter((l) => l.level <= intimacyLevel).map((l) => (
                  <div key={l.level} className="flex items-start gap-2">
                    <span className="text-sm flex-shrink-0">{l.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">Lv.{l.level} {l.name}</p>
                      {l.unlocks.map((u, i) => (
                        <p key={i} className="text-xs text-muted-foreground">{u}</p>
                      ))}
                    </div>
                    <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                      已解锁
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* 未解锁内容 */}
            {intimacyLevel < 10 && (
              <div>
                <h4 className="font-semibold text-sm mb-3 text-muted-foreground">待解锁</h4>
                <div className="space-y-2 opacity-60">
                  {INTIMACY_LEVELS.filter((l) => l.level > intimacyLevel).map((l) => (
                    <div key={l.level} className="flex items-start gap-2">
                      <span className="text-sm flex-shrink-0">🔒</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">Lv.{l.level} {l.name} ({l.requiredPoints} 经验)</p>
                        {l.unlocks.map((u, i) => (
                          <p key={i} className="text-xs text-muted-foreground">{u}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 经验值获取方式 */}
            <div>
              <h4 className="font-semibold text-sm mb-3">经验值获取方式</h4>
              <div className="space-y-1.5">
                {Object.values(POINTS_RULES).map((rule) => (
                  <div
                    key={rule.type}
                    className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2"
                  >
                    <span className="text-muted-foreground">
                      {rule.type === "text_message" && "💬 发送文字消息"}
                      {rule.type === "voice_message" && "🎤 发送语音消息"}
                      {rule.type === "selfie" && "📸 生成自拍"}
                      {rule.type === "daily_first" && "🌅 每日首次互动"}
                      {rule.type === "edit_profile" && "✏️ 编辑女友资料"}
                      {rule.type === "long_conversation" && "💭 深度对话"}
                      {rule.type === "night_chat" && "🌙 夜间互动"}
                    </span>
                    <span className="font-medium text-primary">
                      +{rule.basePoints}
                      {rule.bonusPoints ? ` ~ +${rule.basePoints + rule.bonusPoints}` : ""}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                每日经验值上限 200 · 超过 7 天未互动会衰减 · 过短消息不计算
              </p>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
