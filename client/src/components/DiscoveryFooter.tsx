import { useI18n } from "@/lib/i18n";
import { Link } from "wouter";
/** 公开首页和探索页共用的品牌与 AI 角色说明。 */
import { Sparkles } from "lucide-react";
import { useProductConfig } from "@/features/product/useProductConfig";

/** 展示公开目录底部的品牌信息。 */
export function DiscoveryFooter() {
  const policy = useProductConfig();
  const { t } = useI18n();
  return (
    <footer className="explore-footer">
      <Sparkles size={15} />
      <span>{policy.data?.site.disclosure}</span>
      <Link href="/privacy">{t("privacy:privacyLink")}</Link>
      <Link href="/help">{t("privacy:helpLink")}</Link>
    </footer>
  );
}
