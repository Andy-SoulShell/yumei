import { useProductConfig } from "@/features/product/useProductConfig";
import { KeyStatusIndicator } from "@/components/KeyStatusIndicator";
import { PageError } from "@/components/PageError";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { Check, ExternalLink, Loader2, Save, Star, Zap } from "lucide-react";
import type { ModelInfo } from "./types";
import type { SettingsController } from "./useSettingsController";
type Props = Pick<
  SettingsController,
  | "usesDeepSeek"
  | "t"
  | "apiConfig"
  | "openRouterKey"
  | "setOpenRouterKey"
  | "modelsLoading"
  | "modelsError"
  | "retryModels"
  | "selectedModel"
  | "selectedModelInfo"
  | "modelsData"
  | "modelSearch"
  | "setModelSearch"
  | "filteredModels"
  | "favoriteModels"
  | "handleSelectModel"
  | "toggleFavoriteModel"
  | "handleSaveLlmConfig"
  | "updatePreferences"
  | "isSavingKeys"
  | "hasUnsavedLlmChanges"
>;

/** 搜索和收藏聊天模型，并保存模型分区配置。 */
export function ChatModelSettings({
  usesDeepSeek,
  t,
  apiConfig,
  openRouterKey,
  setOpenRouterKey,
  modelsLoading,
  modelsError,
  retryModels,
  selectedModel,
  selectedModelInfo,
  modelsData,
  modelSearch,
  setModelSearch,
  filteredModels,
  favoriteModels,
  handleSelectModel,
  toggleFavoriteModel,
  handleSaveLlmConfig,
  updatePreferences,
  isSavingKeys,
  hasUnsavedLlmChanges,
}: Props) {
  const sitePolicy = useProductConfig();
  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (num === 0) return t("settings:free");
    if (num < 0.000001) return `$${num.toExponential(1)}`;
    return `$${num.toFixed(6)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          {usesDeepSeek
            ? t("settings:deepseekModelSettings")
            : t("settings:openrouterModelSettings")}
        </CardTitle>
        <CardDescription>
          {usesDeepSeek ? (
            <>
              {t("settings:usingTheOfficialDeepSeekAPIDefaultModel")}{" "}
              {apiConfig?.chatProvider.model}。
            </>
          ) : (
            <>
              {t("settings:accessHundredsOfAIModelsThroughOpenRouterGet")}
              <a
                href={sitePolicy.raw?.site.links.openrouter}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
              >
                {t("settings:openrouterAiKeys")}
                <ExternalLink className="w-3 h-3" />
              </a>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {apiConfig?.chatProvider.model && (
          <div className="rounded-xl border bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              {t("settings:activeChatModel")}
            </p>
            <p className="mt-1 break-all font-mono text-sm">
              {apiConfig.chatProvider.model}
            </p>
          </div>
        )}
        <div className="space-y-2">
          <Label
            htmlFor="openRouterKey"
            className="flex items-center justify-between"
          >
            <span>{t("settings:openrouterAPIKey")}</span>
            <KeyStatusIndicator
              name="openrouter"
              value={openRouterKey}
              saved={apiConfig?.keys.openrouter?.isSet}
            />
          </Label>
          <Input
            id="openRouterKey"
            type="password"
            placeholder={t("settings:skOrV1Xxxxxxxxxxxx")}
            value={openRouterKey}
            onChange={e => {
              setOpenRouterKey(e.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {usesDeepSeek
              ? t("settings:leaveBlankToUseTheConfiguredDeepSeekService")
              : t("settings:leaveBlankToUseTheOperatorSOpenRouter")}
            {t("settings:yourOwnKeyUsesYourOwnAccountBypasses")}
          </p>
        </div>

        {openRouterKey.length > 10 && modelsLoading && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm text-muted-foreground">
              {t("settings:loadingAvailableModels")}
            </span>
          </div>
        )}

        {modelsError && <PageError onRetry={() => void retryModels()} />}

        {selectedModel && (
          <div className="p-3 rounded-lg border bg-primary/5 border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">
                    {t("settings:selectedModel")}
                  </span>
                </div>
                <p className="text-sm mt-1 font-mono">{selectedModel}</p>
                {selectedModelInfo && !usesDeepSeek && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("settings:context")}
                    {(selectedModelInfo.contextLength / 1000).toFixed(0)}
                    {t("settings:kTokensInput")}
                    {formatPrice(selectedModelInfo.pricing.prompt)}
                    {t("settings:tokenOutput")}
                    {formatPrice(selectedModelInfo.pricing.completion)}
                    {t("settings:token")}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {modelsData && !usesDeepSeek && !modelsLoading && (
          <SearchSelect
            value={selectedModel}
            label={t("settings:changeModel")}
            placeholder={t("settings:searchModelNameIDOrProvider")}
            emptyText={t("settings:noMatchingModels")}
            search={modelSearch}
            onSearchChange={setModelSearch}
            options={[
              ...filteredModels.filter((model: ModelInfo) =>
                favoriteModels.includes(model.id)
              ),
              ...filteredModels.filter(
                (model: ModelInfo) => !favoriteModels.includes(model.id)
              ),
            ].map((model: ModelInfo) => ({
              value: model.id,
              label: model.name,
              description: model.id,
              group: favoriteModels.includes(model.id)
                ? t("settings:favorites")
                : model.provider,
              detail: (
                <>
                  <span className="block">
                    {(model.contextLength / 1000).toFixed(0)}K
                  </span>
                  {formatPrice(model.pricing.prompt)}
                </>
              ),
            }))}
            onValueChange={handleSelectModel}
            renderActions={id => (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={favoriteModels.includes(id)}
                onClick={() => toggleFavoriteModel(id)}
              >
                <Star
                  className={
                    favoriteModels.includes(id)
                      ? "size-4 fill-amber-400 text-amber-400"
                      : "size-4"
                  }
                />
                {favoriteModels.includes(id)
                  ? t("settings:removeFromFavorites")
                  : t("settings:addToFavorites")}
              </Button>
            )}
          />
        )}
        {/* LLM 配置保存生效按钮 */}
        {(openRouterKey.length > 0 || selectedModel) && (
          <div className="pt-3">
            <Button
              className="w-full"
              onClick={handleSaveLlmConfig}
              disabled={updatePreferences.isPending || isSavingKeys}
              variant={hasUnsavedLlmChanges ? "default" : "outline"}
            >
              {updatePreferences.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("common:saving")}
                </>
              ) : hasUnsavedLlmChanges ? (
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
            {hasUnsavedLlmChanges && (
              <p className="text-xs text-amber-500 mt-2 text-center">
                {t("settings:youHaveUnsavedChangesSaveChangesToApply")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
