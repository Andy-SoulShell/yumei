import { useProductConfig } from "@/features/product/useProductConfig";
import { PageError } from "@/components/PageError";
import { IntimacyPanel } from "@/components/IntimacyPanel";
import { LevelUpNotice } from "@/components/LevelUpNotice";
import { SelfiePoseDialog } from "@/components/SelfiePoseDialog";
import { Button } from "@/components/ui/button";
import {
  BookHeart,
  Heart,
  Image,
  Loader2,
  Mic,
  Settings,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import Chats from "./Chats";
import type { ChatController } from "@/features/chat/useChatController";

import { ChatComposer } from "@/features/chat/ChatComposer";
import { ChatHeader } from "@/features/chat/ChatHeader";
import { ChatMessages } from "@/features/chat/ChatMessages";
import { useChatController } from "@/features/chat/useChatController";
import { ImageSubmissionRecovery } from "@/features/chat/ImageSubmissionRecovery";
import { MemoryChatNotice } from "@/features/memory/MemoryChatNotice";
export default function Chat() {
  const sitePolicy = useProductConfig();
  const state = useChatController();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileHidden, setProfileHidden] = useState(false);
  const {
    conversationId,
    pageError,
    retryPage,
    invalidConversation,
    conversationLoading,
    girlfriendsLoading,
    activeLoading,
    girlfriend,
    t,
    setLocation,
    setShowIntimacyPanel,
    showCrisisAlert,
    setShowCrisisAlert,
    setShowPoseDialog,
    apiConfig,
    showPoseDialog,
    billingInfo,
    handleSelectPose,
    handleCouplePhoto,
    showIntimacyPanel,
    showLevelUp,
    levelUpLevel,
    setShowLevelUp,
  } = state;

  if (
    conversationId ? conversationLoading || girlfriendsLoading : activeLoading
  ) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (invalidConversation || pageError?.data?.code === "NOT_FOUND")
    return (
      <PageError
        title={t("common:contentUnavailable")}
        actionLabel={t("explore:navCharacters")}
        onRetry={() => setLocation("/characters")}
      />
    );
  if (pageError) return <PageError onRetry={retryPage} />;

  if (!girlfriend) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-4 bg-background">
        <Heart className="w-16 h-16 text-primary mb-4" />
        <h2 className="text-2xl font-bold mb-2">{t("chat:noCompanionYet")}</h2>
        <Button onClick={() => setLocation("/setup")}>
          {t("setup:createCompanion")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`studio-chat-layout ${profileHidden ? "is-profile-hidden" : ""}`}
    >
      <aside
        className="studio-chat-conversations"
        aria-label={t("explore:chatsTitle")}
      >
        <Chats
          embedded
          currentConversationId={state.currentConversationId ?? undefined}
        />
      </aside>
      <div className="chat-page flex flex-col h-full bg-background">
        {/* 顶部导航栏 */}
        <ChatHeader
          {...state}
          girlfriend={girlfriend}
          onProfileOpen={() => {
            if (window.matchMedia("(max-width: 1099px)").matches)
              setProfileOpen(true);
            else setProfileHidden(false);
          }}
        />

        {/* 升级提示 */}
        <LevelUpNotice
          show={showLevelUp}
          newLevel={levelUpLevel}
          onClose={() => setShowLevelUp(false)}
        />

        {/* 提示随消息区滚动，横屏键盘下不挤占输入和发送区域。 */}
        <ChatMessages
          {...state}
          girlfriend={girlfriend}
          footer={
            <>
              <MemoryChatNotice />
              <div className="mx-3 max-h-40 overflow-y-auto sm:mx-4">
                <ImageSubmissionRecovery conversationId={conversationId} />
              </div>

              {/* / SB 243：危机干预资源提示（由 shared/safety.ts 提供检测结果） */}
              {showCrisisAlert && (
                <div className="mx-3 sm:mx-4 mb-2 rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-xs sm:text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2">
                  <Heart className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">
                      {t("chat:youAreNotAloneSomeoneIsHereTo")}
                    </p>
                    <p className="mt-0.5 opacity-90">
                      {t("chat:china400161999524HoursUSCanada")}
                      <a
                        href={sitePolicy.raw?.site.links.support}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {t("common:findahelplineCom")}
                      </a>
                    </p>
                  </div>
                  <Button
                    variant="plain"
                    size="none"
                    type="button"
                    className="opacity-60 hover:opacity-100 shrink-0"
                    onClick={() => setShowCrisisAlert(false)}
                    aria-label={t("chat:dismiss")}
                  >
                    ✕
                  </Button>
                </div>
              )}
            </>
          }
        />

        {/* 输入框 */}
        <ChatComposer {...state} girlfriend={girlfriend} />

        {/* 拍照姿势选择器 */}
        <SelfiePoseDialog
          open={showPoseDialog}
          onOpenChange={setShowPoseDialog}
          intimacyLevel={state.effectiveIntimacyLevel}
          supportsTextToImage={
            apiConfig?.imageProvider.supportsTextToImage === true
          }
          canCouplePhoto={
            billingInfo?.mode === "none" ||
            billingInfo?.byok.selfie === true ||
            billingInfo?.limits.couplePhoto === true
          }
          onSelectPose={handleSelectPose}
          onCouplePhoto={handleCouplePhoto}
        />

        {/* 亲密度详情面板 */}
        <IntimacyPanel
          open={showIntimacyPanel}
          onOpenChange={setShowIntimacyPanel}
          intimacyLevel={state.effectiveIntimacyLevel}
          intimacyPoints={girlfriend.intimacyPoints || 0}
          consecutiveDays={girlfriend.consecutiveDays || 0}
          girlfriendName={girlfriend.name}
        />
      </div>
      {!profileHidden && (
        <aside className="studio-chat-profile">
          <Button
            variant="ghost"
            size="icon"
            className="studio-profile-close"
            aria-label={t("common:close2")}
            onClick={() => setProfileHidden(true)}
          >
            <X />
          </Button>
          <ChatProfile
            girlfriend={girlfriend}
            conversationId={state.currentConversationId}
          />
        </aside>
      )}
      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent
          className="studio-profile-sheet overflow-y-auto"
          side="right"
        >
          <SheetHeader>
            <SheetTitle>{t("studio:profile")}</SheetTitle>
          </SheetHeader>
          <ChatProfile
            girlfriend={girlfriend}
            conversationId={state.currentConversationId}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ChatProfile({
  girlfriend,
  conversationId,
}: {
  girlfriend: NonNullable<ChatController["girlfriend"]>;
  conversationId?: number | null;
}) {
  const { t } = useI18n();
  return (
    <div className="studio-profile-content">
      <img
        className="studio-profile-image"
        src={girlfriend.referenceImageUrl}
        alt={girlfriend.name}
      />
      <div className="studio-profile-info">
        <span className="text-[11px] text-muted-foreground">
          AI · {t("studio:accountSafe")}
        </span>
        <h2>{girlfriend.name}</h2>
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer text-sm font-medium">
            {t("studio:profile")}
          </summary>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {girlfriend.personality}
          </p>
          {girlfriend.interests && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {girlfriend.interests}
            </p>
          )}
        </details>
        <div className="studio-profile-links">
          <Link
            href={`/memories/${girlfriend.id}${conversationId ? `?conversation=${conversationId}` : ""}`}
          >
            <BookHeart />
            {t("common:memoriesAboutYou")}
          </Link>
          <Link href="/settings#chat">
            <Settings />
            {t("settingsFlow:chatTitle")}
          </Link>
          <Link href={`/setup/${girlfriend.id}`}>
            <Mic />
            {t("setup:roleVoiceTitle")}
          </Link>
          <Link href="/generate?view=gallery">
            <Image />
            {t("common:photoGallery")}
          </Link>
          <Link href="/settings#model">
            <Settings />
            {t("settingsFlow:advancedTitle")}
          </Link>
        </div>
      </div>
    </div>
  );
}
