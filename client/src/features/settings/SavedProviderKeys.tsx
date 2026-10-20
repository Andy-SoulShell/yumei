/** 已保存的个人凭据提供明确的移除入口，移除后重新读取服务可用状态。 */
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteConfirmation } from "@/components/DeleteConfirmation";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { KEY_NAMES, type KeyName } from "@shared/providerKeys";
import type { SettingsController } from "./useSettingsController";
const labels: Record<KeyName, string> = {
  openrouter: "OpenRouter",
  fal: "fal.ai",
  elevenlabs: "ElevenLabs",
  "fish-audio": "Fish Audio",
  openai: "OpenAI",
};
export function SavedProviderKeys({
  keys,
  disabled,
}: {
  keys: NonNullable<SettingsController["apiConfig"]>["keys"] | undefined;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const remove = trpc.apiConfig.clearKey.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
    },
    onError: () => toast.error(t("auth:requestFailed")),
  });
  const saved = KEY_NAMES.filter(name => keys?.[name]?.isSet);
  if (!saved.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("settings:savedApiKeys")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {saved.map(name => (
          <div key={name} className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-sm">
              {labels[name]}{" "}
              <span className="text-muted-foreground">
                ••••{keys?.[name]?.lastFour}
              </span>
            </span>
            <DeleteConfirmation
              subject={labels[name]}
              disabled={disabled || remove.isPending}
              onConfirm={() => remove.mutate({ name })}
            >
              <Button
                variant="ghost"
                size="icon"
                disabled={disabled || remove.isPending}
                aria-label={t("settings:removeApiKey", { name: labels[name] })}
              >
                {remove.isPending && remove.variables?.name === name ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </DeleteConfirmation>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
