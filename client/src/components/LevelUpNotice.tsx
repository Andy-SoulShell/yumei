/** 升级反馈留在聊天页内，不遮挡消息、不接管输入焦点。 */
import { useEffect } from "react";
import { X } from "lucide-react";
import { getLevelInfo } from "@shared/intimacy";
import { useI18n } from "@/lib/i18n";
import { intimacyMessages } from "@/locales/domain";
import { usePersistFn } from "@/hooks/usePersistFn";
import { Button } from "@/components/ui/button";

export function LevelUpNotice({
  show,
  newLevel,
  onClose,
}: {
  show: boolean;
  newLevel: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const close = usePersistFn(onClose);
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(close, 3500);
    return () => clearTimeout(timer);
  }, [show, newLevel, close]);
  if (!show) return null;
  const level = getLevelInfo(newLevel);
  return (
    <div className="chat-level-notice">
      <p role="status">
        <span aria-hidden="true">{level.emoji}</span>{" "}
        {t("intimacy:intimacyLevelUp")} · Lv.{level.level}{" "}
        {t(intimacyMessages[level.level].name)}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={close}
        aria-label={t("common:close2")}
      >
        <X />
      </Button>
    </div>
  );
}
