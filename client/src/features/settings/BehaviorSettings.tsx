import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { SettingsController } from "./useSettingsController";
type Props = Pick<
  SettingsController,
  | "t"
  | "globalPrompt"
  | "setGlobalPrompt"
  | "showAdvancedPrompt"
  | "setShowAdvancedPrompt"
  | "replyLanguage"
  | "setReplyLanguage"
  | "replyLengthLimit"
  | "setReplyLengthLimit"
  | "handleSaveAiConfig"
  | "updatePreferences"
  | "isSavingKeys"
  | "hasUnsavedAiChanges"
>;

/** 编辑全局提示词、回复语言与长度，支持模板及分区保存。 */
export function BehaviorSettings({
  t,
  globalPrompt,
  setGlobalPrompt,
  showAdvancedPrompt,
  setShowAdvancedPrompt,
  replyLanguage,
  setReplyLanguage,
  replyLengthLimit,
  setReplyLengthLimit,
  handleSaveAiConfig,
  updatePreferences,
  isSavingKeys,
  hasUnsavedAiChanges,
}: Props) {
  const promptTemplates = [
    {
      label: t("settings:everydayCompanionship"),
      text: t("settings:replyWarmlyAndThoughtfullyShowInterestInEveryday"),
    },
    {
      label: t("settings:roleplay"),
      text: t("settings:stayInCharacterReflectTheCharacterSPersonality"),
    },
    {
      label: t("settings:shortReplies"),
      text: t("settings:keepRepliesConciseWithin23SentencesUse"),
    },
    {
      label: t("settings:deeperConversations"),
      text: t("settings:exploreTopicsInDepthAndShareThoughtfulPerspectives"),
    },
    {
      label: t("settings:playfulAndLively"),
      text: t("settings:beEnergeticAndHumorousUsePlayfulJokesAnd"),
    },
    {
      label: t("settings:warmAndComforting"),
      text: t("settings:replyWithWarmthCareAndEncouragementBeEspecially"),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          {t("settings:aiBehavior")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 全局默认提示词 */}
        <div className="space-y-2">
          <Label htmlFor="globalPrompt">
            {t("settings:sharedSystemPrompt")}
          </Label>
          <Textarea
            id="globalPrompt"
            placeholder={t("settings:forExampleKeepRepliesShortAndPlayfulUse")}
            value={globalPrompt}
            onChange={e => {
              setGlobalPrompt(e.target.value);
            }}
            rows={4}
            maxLength={500}
            className="resize-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {t("settings:thisPromptAppliesToConversationsWithAllYour")}
            </p>
            <span className="text-xs text-muted-foreground">
              {globalPrompt.length}/500
            </span>
          </div>
        </div>

        {/* 快捷模板 */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {t("settings:quickTemplates")}
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {promptTemplates.map(tpl => (
              <Button
                variant="plain"
                size="none"
                type="button"
                key={tpl.label}
                aria-pressed={globalPrompt === tpl.text}
                onClick={() => {
                  setGlobalPrompt(tpl.text);
                  toast.success(
                    t("settings:templateApplied", { name: tpl.label })
                  );
                }}
                className={`text-left p-2.5 rounded-xl text-sm transition-colors hover:bg-primary/5 ${
                  globalPrompt === tpl.text ? "bg-primary/10" : "bg-muted/40"
                }`}
              >
                <span className="font-medium">{tpl.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* 高级选项 */}
        <Collapsible
          open={showAdvancedPrompt}
          onOpenChange={setShowAdvancedPrompt}
          className="pt-4"
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="plain"
              size="none"
              type="button"
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              {showAdvancedPrompt ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              {t("settings:advancedOptions")}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="replyLanguage">
                {t("settings:aiReplyLanguage")}
              </Label>
              <Input
                id="replyLanguage"
                placeholder={t(
                  "settings:defaultChineseYouCanChooseEnglishJapaneseOr"
                )}
                value={replyLanguage}
                onChange={e => {
                  setReplyLanguage(e.target.value);
                }}
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="replyLengthLimit">
                {t("settings:replyLength")}
              </Label>
              <Input
                id="replyLengthLimit"
                placeholder={t("settings:forExampleUnder50Words23Sentences")}
                value={replyLengthLimit}
                onChange={e => {
                  setReplyLengthLimit(e.target.value);
                }}
                maxLength={50}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* AI 行为设定保存生效按钮 */}
        <div className="pt-3">
          <Button
            className="w-full"
            onClick={handleSaveAiConfig}
            disabled={updatePreferences.isPending || isSavingKeys}
            variant={hasUnsavedAiChanges ? "default" : "outline"}
          >
            {updatePreferences.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("common:saving")}
              </>
            ) : hasUnsavedAiChanges ? (
              <>
                <Save className="w-4 h-4 mr-2" />
                {t("settings:saveChanges")}
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                {t("settings:settingsSaved")}
              </>
            )}
          </Button>
          {hasUnsavedAiChanges && (
            <p className="text-xs text-amber-500 mt-2 text-center">
              {t("settings:youHaveUnsavedAIBehaviorSettingsSaveChanges")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
