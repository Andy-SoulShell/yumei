import { useI18n } from "@/lib/i18n";
export function UploadPrivacyNotice() {
  const { t } = useI18n();
  return (
    <p className="text-xs text-muted-foreground">
      {t("privacy:uploadNotice")}{" "}
      <a
        href="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline"
      >
        {t("privacy:privacyLink")}
      </a>
    </p>
  );
}
