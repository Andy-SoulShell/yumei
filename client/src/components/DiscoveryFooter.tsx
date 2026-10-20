/** 公开首页和探索页共用的品牌与 AI 角色说明。 */
import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** 展示公开目录底部的品牌信息。 */
export function DiscoveryFooter() {
  const { t } = useI18n();
  return (
    <footer className="explore-footer">
      <Sparkles size={15} />
      <span>{t("explore:disclosure")}</span>
      <span>YUMEI — {t("explore:brandCaption")}</span>
    </footer>
  );
}
