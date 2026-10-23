import { usePageBack } from "@/hooks/usePageBack";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProductConfig } from "@/features/product/useProductConfig";
import { useI18n } from "@/lib/i18n";
import {
  ArrowLeft,
  BookHeart,
  Ellipsis,
  Image as ImageIcon,
  Moon,
  Mic,
  Plus,
  Settings,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { getLevelByPoints } from "../../../../shared/intimacy";

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
  | "isAccepting"
  | "chatStream"
  | "generateSelfie"
  | "generateCouple"
  | "isRecording"
  | "isTranscribing"
  | "autoPlay"
  | "toggleAutoPlay"
  | "speedOptions"
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
  isAccepting,
  chatStream,
  generateSelfie,
  generateCouple,
  isRecording,
  isTranscribing,
  autoPlay,
  toggleAutoPlay,
  playbackSpeed,
  speedOptions,
  updateSpeed,
  toggleTheme,
  theme,
}: Props) {
  const policy = useProductConfig();
  const { locale } = useI18n();
  const goBack = usePageBack("/chats");
  const newConversationDisabled =
    !currentConversationId ||
    createConversation.isPending ||
    isAccepting ||
    chatStream.isGenerating ||
    generateSelfie.isPending ||
    generateCouple.isPending ||
    isRecording ||
    isTranscribing;
  const startConversation = () =>
    createConversation.mutate({
      girlfriendId: girlfriend.id,
      locale,
    });
  const changeSpeed = (value: string) => {
    const option = speedOptions.find(option => String(option.value) === value);
    if (!option) return;
    updateSpeed(option.value);
    toast.success(t("chat:playbackSpeedSetTo", { speed: option.label }));
  };
  const autoPlayLabel = autoPlay
    ? t("chat:turnOffAutoRead")
    : t("chat:turnOnAutoRead");
  return (
    <header className="chat-header">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("explore:navChats")}
        onClick={goBack}
      >
        <ArrowLeft className="w-5 h-5" />
      </Button>

      <Avatar className="size-10 shrink-0">
        <AvatarImage
          src={girlfriend.avatarUrl || girlfriend.referenceImageUrl}
          alt={girlfriend.name}
        />
        <AvatarFallback>{girlfriend.name[0]}</AvatarFallback>
      </Avatar>

      <div className="chat-identity min-w-0">
        <div className="chat-title-row">
          <h1
            className="min-w-0 font-semibold text-sm sm:text-base truncate"
            title={girlfriend.name}
          >
            {girlfriend.name}
          </h1>
          {currentMoodInfo && (
            <span
              className="chat-mood-emoji shrink-0 text-sm"
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
            if (!policy.data) return null;
            const info = getLevelByPoints(
              girlfriend.intimacyPoints,
              policy.data.intimacy.levels
            );
            const level = info.level;
            return (
              <Button
                variant="plain"
                size="none"
                type="button"
                className={`chat-intimacy-button text-xs flex items-center hover:opacity-80 transition-opacity`}
                style={{ color: info.color }}
                onClick={() => setShowIntimacyPanel(true)}
                title={t("chat:intimacyLv", {
                  name: info.name,
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
        <p className="chat-status text-muted-foreground">
          {t("chat:aiCompanionNotARealPerson")}
          {ttsLabel ? t("chat:voice", { name: ttsLabel }) : ""}
        </p>
      </div>

      <div className="chat-desktop-actions">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("chat:newConversation")}
          title={t("chat:startANewConversationYourHistoryWillBe")}
          disabled={newConversationDisabled}
          onClick={startConversation}
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
          aria-label={autoPlayLabel}
          aria-pressed={autoPlay}
          title={
            autoPlay ? t("chat:turnOffAutoRead") : t("chat:turnOnAutoRead")
          }
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
              onValueChange={changeSpeed}
            >
              {speedOptions.map(option => (
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
          aria-label={t("common:toggleDisplayMode")}
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
          aria-label={t("common:memoriesAboutYou")}
          onClick={() =>
            setLocation(
              `/memories/${girlfriend.id}${currentConversationId ? `?conversation=${currentConversationId}` : ""}`
            )
          }
        >
          <BookHeart className="w-4 h-4 sm:w-5 sm:h-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          onClick={() => setLocation("/gallery")}
          aria-label={t("common:photoGallery")}
        >
          <ImageIcon className="w-5 h-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          onClick={() => setLocation("/settings")}
          aria-label={t("common:settings")}
        >
          <Settings className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          onClick={() => setLocation(`/setup/${girlfriend.id}`)}
          aria-label={t("setup:roleVoiceTitle")}
          title={t("setup:roleVoiceTitle")}
        >
          <Mic className="w-5 h-5" />
        </Button>
      </div>
      <div className="chat-compact-actions">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("chat:moreActions")}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="chat-actions-menu w-60">
            <DropdownMenuItem
              disabled={newConversationDisabled}
              onSelect={startConversation}
            >
              <Plus />
              {t("chat:newConversation")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={toggleAutoPlay}>
              {autoPlay ? <Volume2 /> : <VolumeX />}
              {autoPlayLabel}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {t("chat:playbackSpeed")} · {playbackSpeed}
                {t("chat:x")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={String(playbackSpeed)}
                  onValueChange={changeSpeed}
                >
                  {speedOptions.map(option => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={String(option.value)}
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                setLocation(
                  `/memories/${girlfriend.id}${currentConversationId ? `?conversation=${currentConversationId}` : ""}`
                )
              }
            >
              <BookHeart />
              {t("common:memoriesAboutYou")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLocation("/gallery")}>
              <ImageIcon />
              {t("common:photoGallery")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={toggleTheme}>
              {theme === "light" ? <Moon /> : <Sun />}
              {t("common:toggleDisplayMode")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLocation("/settings")}>
              <Settings />
              {t("common:settings")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setLocation(`/setup/${girlfriend.id}`)}
            >
              <Mic />
              {t("setup:roleVoiceTitle")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
