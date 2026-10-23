/** 站点服务先展示音色，用户密钥保留为可选的高级入口。 */
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { ApiConfig } from "./types";

export function VoiceServiceAccess({
  provider,
  config,
  children,
}: {
  provider: "elevenlabs" | "fishaudio";
  config: ApiConfig;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const access = config?.voiceProviders?.[provider];
  const ownKey =
    config?.keys[provider === "elevenlabs" ? provider : "fish-audio"].isSet;
  return (
    <>
      {access && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            access.available
              ? ownKey
                ? "settings:voiceUsingOwnService"
                : "settings:voiceUsingSiteService"
              : access.configured
                ? "settings:voicePlanRequired"
                : "settings:voiceServiceUnavailable"
          )}
        </p>
      )}
      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("settings:voiceOwnKeyOptional")}
        </summary>
        <div className="pt-3">{children}</div>
      </details>
    </>
  );
}
