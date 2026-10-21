import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit, MessageCircle, Trash2 } from "lucide-react";
import { getLevelGradient, getLevelInfo } from "../../../../shared/intimacy";
import type { HomeController } from "./useHomeController";

type Props = Pick<
  HomeController,
  | "moods"
  | "levels"
  | "moodMap"
  | "selectedIds"
  | "batchMode"
  | "toggleSelect"
  | "t"
  | "intimacyMap"
  | "updateGirlfriend"
  | "resumeChat"
  | "handleStartChat"
  | "setLocation"
  | "setDeleteTarget"
> & { girlfriends: NonNullable<HomeController["girlfriends"]> };

/** 展示角色、当前心情与亲密度，并提供聊天和批量选择入口。 */
export function CharacterGrid({
  girlfriends,
  levels,
  moods,
  moodMap,
  selectedIds,
  batchMode,
  toggleSelect,
  t,
  intimacyMap,
  updateGirlfriend,
  resumeChat,
  handleStartChat,
  setLocation,
  setDeleteTarget,
}: Props) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {girlfriends.map(gf => {
        const mood = moodMap[gf.id];
        const moodInfo = mood ? moods?.[mood.mood] : null;
        const isSelected = selectedIds.has(gf.id);

        return (
          <Card
            key={gf.id}
            className={`companion-card transition-all hover:shadow-md ${
              gf.isActive ? "is-active" : ""
            } ${isSelected ? "ring-2 ring-destructive bg-destructive/5" : ""}`}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="companion-layout flex items-center gap-3 sm:gap-4">
                {/* 批量选择复选框 */}
                {batchMode && (
                  <div className="flex-shrink-0">
                    <Checkbox
                      aria-label={t("characters:select", { name: gf.name })}
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(gf.id)}
                    />
                  </div>
                )}

                {/* 头像 */}
                <div className="relative flex-shrink-0">
                  <Avatar className="w-12 h-12 sm:w-16 sm:h-16">
                    <AvatarImage
                      src={gf.avatarUrl || gf.referenceImageUrl}
                      alt={gf.name}
                    />
                    <AvatarFallback className="text-lg">
                      {gf.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  {/* 心情气泡 */}
                  {moodInfo && (
                    <div
                      style={{ backgroundColor: moodInfo.background }}
                      className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center border-2 border-background text-sm`}
                      title={t("common:points", {
                        mood: moodInfo.label,
                        points: mood!.moodScore,
                      })}
                    >
                      {moodInfo.emoji}
                    </div>
                  )}
                </div>

                {/* 信息 */}
                <div className="companion-info flex-1 min-w-0">
                  <div className="companion-name flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg truncate">
                      {gf.name}
                    </h3>
                    {gf.isActive && (
                      <Badge
                        variant="default"
                        className="text-xs flex-shrink-0"
                      >
                        {t("home:active")}
                      </Badge>
                    )}
                    {/* 亲密度等级徽章 */}
                    {(() => {
                      const intimacy = intimacyMap[gf.id];
                      if (!intimacy || !levels) return null;
                      const levelInfo = getLevelInfo(intimacy.level, levels);
                      return (
                        <span
                          className={`text-xs flex-shrink-0 flex items-center gap-0.5 `}
                          style={{ color: levelInfo.color }}
                          title={t("home:lvXP", {
                            name: levelInfo.name,
                            level: levelInfo.level,
                            points: intimacy.points,
                          })}
                        >
                          <span>{levelInfo.emoji}</span>
                          <span className="font-medium">
                            {t("common:lv")}
                            {levelInfo.level}
                          </span>
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {gf.personality}
                  </p>
                  {/* 亲密度进度条 */}
                  {(() => {
                    const intimacy = intimacyMap[gf.id];
                    if (!intimacy || !levels) return null;
                    const levelInfo = getLevelInfo(intimacy.level, levels);
                    const gradient = getLevelGradient(intimacy.level, levels);
                    return (
                      <div className="mt-1.5">
                        <div className="flex items-center justify-between mb-0.5">
                          <span
                            className="text-[10px] font-medium"
                            style={{ color: levelInfo.color }}
                          >
                            {levelInfo.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {intimacy.pointsToNext !== null
                              ? t("common:xpToNextLevel", {
                                  points: intimacy.pointsToNext,
                                })
                              : t("common:maxLevel")}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${intimacy.progress}%`,
                              backgroundImage: gradient,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                  {/* 心情状态文字 */}
                  {moodInfo && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className="text-xs font-medium"
                        style={{ color: moodInfo.color }}
                      >
                        {moodInfo.label}
                      </span>
                      {mood!.todayMessages > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {t("home:todayMessages", {
                            count: mood!.todayMessages,
                          })}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                {!batchMode && (
                  <div className="companion-actions flex flex-col gap-1.5 sm:gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      disabled={
                        updateGirlfriend.isPending || resumeChat.isPending
                      }
                      onClick={() => handleStartChat(gf.id)}
                    >
                      <MessageCircle className="w-4 h-4 mr-1" />
                      {t("common:chat")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/setup/${gf.id}`)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      {t("home:edit")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                      onClick={() =>
                        setDeleteTarget({
                          id: gf.id,
                          name: gf.name,
                          isActive: gf.isActive,
                        })
                      }
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      {t("common:delete")}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
