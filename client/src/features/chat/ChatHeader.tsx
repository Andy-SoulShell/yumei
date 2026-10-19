import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SPEED_OPTIONS } from "@/hooks/useTTS";
import { intimacyMessages } from "@/locales/domain";
import {
  ArrowLeft,
  BookHeart,
  Image as ImageIcon,
  Moon,
  Plus,
  Settings,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { getLevelInfo } from "../../../../shared/intimacy";

import type { ChatController } from "./useChatController";
type Props = Pick<
  ChatController,
  | "ttsLabel"
  | "currentMoodInfo"
  | "t"
  | "setLocation"
  | "moodData"
  | "setShowIntimacyPanel"
  | "currentConversationId"
  | "createConversation"
  | "sendMessage"
  | "generateSelfie"
  | "generateCouple"
  | "isRecording"
  | "isTranscribing"
  | "autoPlay"
  | "toggleAutoPlay"
  | "playbackSpeed"
  | "updateSpeed"
  | "toggleTheme"
  | "theme"
> & { girlfriend: NonNullable<ChatController["girlfriend"]> };

/** 展示当前角色和心情，提供会话、记忆、语速与主题操作。 */
export function ChatHeader({
  ttsLabel,
  currentMoodInfo,
  t,
  setLocation,
  girlfriend,
  moodData,
  setShowIntimacyPanel,
  currentConversationId,
  createConversation,
  sendMessage,
  generateSelfie,
  generateCouple,
  isRecording,
  isTranscribing,
  autoPlay,
  toggleAutoPlay,
  playbackSpeed,
  updateSpeed,
  toggleTheme,
  theme,
}: Props) {
  return (
    <header
      className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 sm:py-3 border-b bg-card"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("explore:navChats")}
        onClick={() => setLocation("/chats")}
      >
        <ArrowLeft className="w-5 h-5" />
      </Button>

      <Avatar className="w-8 h-8 sm:w-10 sm:h-10">
        <AvatarImage
          src={girlfriend.avatarUrl || girlfriend.referenceImageUrl}
          alt={girlfriend.name}
        />
        <AvatarFallback>{girlfriend.name[0]}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 sm:gap-2">
          <h1 className="font-semibold text-sm sm:text-base truncate">
            {girlfriend.name}
          </h1>
          {currentMoodInfo && (
            <span
              className="text-sm"
              title={t("common:points", {
                mood: currentMoodInfo.label,
                points: moodData!.moodScore,
              })}
            >
              {currentMoodInfo.emoji}
            </span>
          )}
          {/* 亲密度徽章 */}
          {(() => {
            const level = girlfriend.intimacyLevel || 1;
            const info = getLevelInfo(level);
            return (
              <Button
                variant="plain"
                size="none"
                type="button"
                className={`text-xs flex items-center gap-0.5 ${info.color} hover:opacity-80 transition-opacity`}
                onClick={() => setShowIntimacyPanel(true)}
                title={t("chat:intimacyLv", {
                  name: t(intimacyMessages[info.level].name),
                  level: level,
                })}
              >
                <span>{info.emoji}</span>
                <span className="font-medium">
                  {t("common:lv")}
                  {level}
                </span>
              </Button>
            );
          })()}
        </div>
        <p className="text-xs text-muted-foreground">
          {currentMoodInfo ? (
            <span className={currentMoodInfo.color}>
              {currentMoodInfo.label}
            </span>
          ) : (
            t("chat:online")
          )}
          {ttsLabel ? t("chat:voice", { name: ttsLabel }) : ""}
          {/* / SB 243：AI 身份常驻披露 */}
          <span className="opacity-70">
            {" "}
            {t("chat:aiCompanionNotARealPerson")}
          </span>
        </p>
      </div>

      {/* 语音自动播放开关 */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("chat:newConversation")}
        title={t("chat:startANewConversationYourHistoryWillBe")}
        disabled={
          !currentConversationId ||
          createConversation.isPending ||
          sendMessage.isPending ||
          generateSelfie.isPending ||
          generateCouple.isPending ||
          isRecording ||
          isTranscribing
        }
        onClick={() =>
          createConversation.mutate({
            girlfriendId: girlfriend.id,
            title: t("chat:conversationWith", { name: girlfriend.name }),
          })
        }
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline ml-1">
          {t("chat:newConversation")}
        </span>
      </Button>
      <Button
        variant={autoPlay ? "default" : "ghost"}
        size="icon"
        className="h-8 w-8 sm:h-10 sm:w-10"
        onClick={toggleAutoPlay}
        title={autoPlay ? t("chat:turnOffAutoRead") : t("chat:turnOnAutoRead")}
      >
        {autoPlay ? (
          <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
        ) : (
          <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />
        )}
      </Button>

      {/* 播放速度控制 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs font-mono px-1.5 sm:px-2 h-8"
            aria-label={t("chat:playbackSpeed")}
            title={t("chat:playbackSpeed")}
          >
            {playbackSpeed}
            {t("chat:x")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={String(playbackSpeed)}
            onValueChange={value => {
              const option = SPEED_OPTIONS.find(
                option => String(option.value) === value
              );
              if (!option) return;
              updateSpeed(option.value);
              toast.success(
                t("chat:playbackSpeedSetTo", { speed: option.label })
              );
            }}
          >
            {SPEED_OPTIONS.map(option => (
              <DropdownMenuRadioItem
                key={option.value}
                value={String(option.value)}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 sm:h-10 sm:w-10"
        onClick={toggleTheme}
      >
        {theme === "light" ? (
          <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
        ) : (
          <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 sm:h-10 sm:w-10"
        title={t("common:memoriesAboutYou")}
        onClick={() => setLocation(`/memories/${girlfriend.id}`)}
      >
        <BookHeart className="w-4 h-4 sm:w-5 sm:h-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden sm:inline-flex"
        onClick={() => setLocation("/gallery")}
      >
        <ImageIcon className="w-5 h-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden sm:inline-flex"
        onClick={() => setLocation("/settings")}
      >
        <Settings className="w-5 h-5" />
      </Button>
    </header>
  );
}
