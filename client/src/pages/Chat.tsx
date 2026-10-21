import { useProductConfig } from "@/features/product/useProductConfig";
import { PageError } from "@/components/PageError";
import { IntimacyPanel } from "@/components/IntimacyPanel";
import { LevelUpNotice } from "@/components/LevelUpNotice";
import { SelfiePoseDialog } from "@/components/SelfiePoseDialog";
import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";

import { ChatComposer } from "@/features/chat/ChatComposer";
import { ChatHeader } from "@/features/chat/ChatHeader";
import { ChatMessages } from "@/features/chat/ChatMessages";
import { useChatController } from "@/features/chat/useChatController";
export default function Chat() {
  const sitePolicy = useProductConfig();
  const state = useChatController();
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
    <div className="chat-page flex flex-col h-full bg-background">
      {/* 顶部导航栏 */}
      <ChatHeader {...state} girlfriend={girlfriend} />

      {/* 升级提示 */}
      <LevelUpNotice
        show={showLevelUp}
        newLevel={levelUpLevel}
        onClose={() => setShowLevelUp(false)}
      />

      {/* 消息列表 */}
      <ChatMessages {...state} girlfriend={girlfriend} />

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
  );
}
