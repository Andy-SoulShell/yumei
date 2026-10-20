import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Brain, ChevronDown, ChevronUp, Eye } from "lucide-react";
import type { SetupController } from "./useSetupController";
type Props = Pick<
  SetupController,
  | "showCustomPrompt"
  | "setShowCustomPrompt"
  | "t"
  | "customPrompt"
  | "setCustomPrompt"
  | "showPromptPreview"
  | "setShowPromptPreview"
  | "apiConfig"
  | "personality"
  | "appearance"
  | "interests"
>;

/** 编辑角色专属指令，折叠展示系统提示词预览。 */
export function CharacterPrompt({
  showCustomPrompt,
  setShowCustomPrompt,
  t,
  customPrompt,
  setCustomPrompt,
  showPromptPreview,
  setShowPromptPreview,
  apiConfig,
  personality,
  appearance,
  interests,
}: Props) {
  return (
    <Collapsible
      open={showCustomPrompt}
      onOpenChange={setShowCustomPrompt}
      className="pt-4"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="plain"
          size="none"
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {showCustomPrompt ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          <Brain className="w-4 h-4" />
          {t("setup:advancedPrompt")}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customPrompt">
            {t("setup:companionSpecificPrompt")}
          </Label>
          <Textarea
            id="customPrompt"
            placeholder={t(
              "setup:forExampleAPlayfulToneOccasionalJapaneseWords"
            )}
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            rows={3}
            maxLength={300}
            className="resize-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {t("setup:onlyAppliesToThisCompanionAfterTheShared")}
            </p>
            <span className="text-xs text-muted-foreground">
              {customPrompt.length}/300
            </span>
          </div>
        </div>

        {/* 提示词预览 */}
        <Collapsible
          open={showPromptPreview}
          onOpenChange={setShowPromptPreview}
          className="space-y-2"
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="plain"
              size="none"
              type="button"
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              {showPromptPreview
                ? t("setup:hidePreview")
                : t("setup:previewTheCombinedPrompt")}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
            {/* 全局提示词 */}
            {apiConfig?.preferences?.globalPrompt ? (
              <div className="rounded p-2 bg-blue-500/10 border border-blue-500/20">
                <span className="text-[10px] font-semibold text-blue-500 uppercase">
                  {t("setup:sharedPrompt")}
                </span>
                <p className="mt-1 text-foreground/80">
                  {apiConfig.preferences?.globalPrompt}
                </p>
              </div>
            ) : (
              <div className="rounded p-2 bg-muted/50 border border-dashed">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                  {t("setup:sharedPrompt")}
                </span>
                <p className="mt-1 text-muted-foreground italic">
                  {t("setup:notSetConfigureItInSettings")}
                </p>
              </div>
            )}

            {/* 个体提示词 */}
            {customPrompt ? (
              <div className="rounded p-2 bg-primary/10 border border-primary/20">
                <span className="text-[10px] font-semibold text-primary uppercase">
                  {t("setup:companionPrompt")}
                </span>
                <p className="mt-1 text-foreground/80">{customPrompt}</p>
              </div>
            ) : (
              <div className="rounded p-2 bg-muted/50 border border-dashed">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                  {t("setup:companionPrompt")}
                </span>
                <p className="mt-1 text-muted-foreground italic">
                  {t("setup:notSet")}
                </p>
              </div>
            )}

            {/* 性格 + 外貌结构化字段 */}
            <div className="rounded p-2 bg-purple-500/10 border border-purple-500/20">
              <span className="text-[10px] font-semibold text-purple-500 uppercase">
                {t("setup:characterProfile")}
              </span>
              <p className="mt-1 text-foreground/80">
                {t("setup:personality2")}
                {personality || t("setup:notProvided")} {t("setup:appearance2")}
                {appearance || t("setup:notProvided")}
                {interests && t("setup:interests", { interests: interests })}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CollapsibleContent>
    </Collapsible>
  );
}
