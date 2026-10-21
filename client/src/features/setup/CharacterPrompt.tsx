import { useProductConfig } from "@/features/product/useProductConfig";
import { buildChatSystemPrompt } from "@shared/chatPrompt";
import { PageError } from "@/components/PageError";
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
  | "previewCharacter"
  | "previewMemoryEnabled"
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
  previewCharacter,
  previewMemoryEnabled,
}: Props) {
  const policy = useProductConfig();
  const preview = policy.raw
    ? buildChatSystemPrompt(
        policy.raw,
        previewCharacter,
        apiConfig?.preferences ?? {},
        { memoryEnabled: previewMemoryEnabled }
      )
    : null;
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
            {preview !== null ? (
              <pre className="whitespace-pre-wrap break-words text-xs max-h-96 overflow-auto">
                {preview}
              </pre>
            ) : policy.error ? (
              <PageError onRetry={() => void policy.refetch()} />
            ) : (
              <p role="status">{t("auth:working")}</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CollapsibleContent>
    </Collapsible>
  );
}
