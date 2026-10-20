/** 编辑角色专属指令，并展示与后端共用生成器产出的实际提示词。 */
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildChatSystemPrompt,
  buildPortraitPrompt,
} from "@shared/characterPrompt";
import { Brain, ChevronDown, ChevronUp, Eye } from "lucide-react";
import type { SetupController } from "./useSetupController";

type PreviewProps = Pick<
  SetupController,
  | "t"
  | "name"
  | "personality"
  | "appearance"
  | "interests"
  | "customPrompt"
  | "apiConfig"
  | "showPromptPreview"
  | "setShowPromptPreview"
> & { includePortrait?: boolean };

/** 预览当前草稿实际使用的静态聊天提示词及 YUMEI 生图指令。 */
export function CharacterPromptPreview({
  t,
  name,
  personality,
  appearance,
  interests,
  customPrompt,
  apiConfig,
  showPromptPreview,
  setShowPromptPreview,
  includePortrait = false,
}: PreviewProps) {
  const prompt = buildChatSystemPrompt(
    { name, personality, appearance, interests, customPrompt },
    apiConfig?.preferences ?? undefined
  );
  return (
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
          <Eye className="size-3.5" />
          {showPromptPreview
            ? t("setup:hidePreview")
            : t("setup:previewTheCombinedPrompt")}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-lg border bg-muted/30 p-3 space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          {t("creator:promptPreviewHint")}
        </p>
        <p className="text-xs font-medium">{t("creator:chatPromptLabel")}</p>
        <pre
          data-testid="chat-system-prompt"
          className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed"
        >
          {prompt}
        </pre>
        {includePortrait && (
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-xs font-medium">
              {t("creator:portraitPromptLabel")}
            </summary>
            <pre
              data-testid="portrait-prompt"
              className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed"
            >
              {buildPortraitPrompt(appearance)}
            </pre>
          </details>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

type Props = PreviewProps &
  Pick<
    SetupController,
    "showCustomPrompt" | "setShowCustomPrompt" | "setCustomPrompt"
  >;

/** 编辑额外的角色行为偏好；预览与实际聊天共享角色资料、语言和长度要求。 */
export function CharacterPrompt(props: Props) {
  const {
    t,
    showCustomPrompt,
    setShowCustomPrompt,
    customPrompt,
    setCustomPrompt,
  } = props;
  return (
    <Collapsible
      open={showCustomPrompt}
      onOpenChange={setShowCustomPrompt}
      className="border-t pt-4"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="plain"
          size="none"
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {showCustomPrompt ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          <Brain className="size-4" />
          {t("setup:advancedPrompt")}
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
            {t("setup:optional")}
          </span>
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
        <CharacterPromptPreview {...props} />
      </CollapsibleContent>
    </Collapsible>
  );
}
