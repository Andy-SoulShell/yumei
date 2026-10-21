/** 升级反馈留在聊天页内，不遮挡消息、不接管输入焦点。 */
import { useEffect } from "react";
import { X } from "lucide-react";
import { getLevelInfo } from "@shared/intimacy";
import { useI18n } from "@/lib/i18n";
import { useProductConfig } from "@/features/product/useProductConfig";
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
  const policy = useProductConfig();
  const close = usePersistFn(onClose);
  useEffect(() => {
    if (!show || !policy.raw) return;
    const timer = setTimeout(close, policy.raw.experience.levelNoticeMs);
    return () => clearTimeout(timer);
  }, [show, newLevel, close, policy.raw]);
  if (!show || !policy.data) return null;
  const level = getLevelInfo(newLevel, policy.data.intimacy.levels);
  return (
    <div className="chat-level-notice">
      <p role="status">
        <span aria-hidden="true">{level.emoji}</span>{" "}
        {t("intimacy:intimacyLevelUp")} · Lv.{level.level} {level.name}
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
