/** 查询失败时提供明确的重试入口，避免把错误显示成空列表。 */
import { AlertCircle, RotateCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function PageError({
  onRetry,
  title,
  actionLabel,
}: {
  onRetry: () => void;
  title?: string;
  actionLabel?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center"
    >
      <AlertCircle
        className="size-8 text-muted-foreground"
        aria-hidden="true"
      />
      <h2 className="text-base font-medium">
        {title || t("common:loadFailed")}
      </h2>
      <Button variant="outline" onClick={onRetry}>
        {!actionLabel && <RotateCw className="size-4" />}
        {actionLabel || t("explore:retry")}
      </Button>
    </div>
  );
}
