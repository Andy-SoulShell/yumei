/** 根据手势状态展示下拉进度、松手提示与刷新动画。 */

import { useI18n } from "@/lib/i18n";
import { Loader2, ArrowDown } from "lucide-react";

/** 下拉刷新展示状态，距离与阈值单位均为像素。 */
interface PullToRefreshIndicatorProps {
  /** 已应用阻尼的下拉距离，单位为像素。 */
  pullDistance: number;
  /** 刷新操作是否正在执行。 */
  isRefreshing: boolean;
  isPulling: boolean;
  /** 触发阈值，单位为像素。 */
  threshold?: number;
}

/** 显示下拉刷新视觉反馈，不负责识别手势或执行数据请求。 */
export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  isPulling,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  const { t } = useI18n();
  if (!isPulling && !isRefreshing) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const isReady = progress >= 1;

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-all duration-200"
      style={{
        height: isRefreshing ? 48 : pullDistance,
        opacity: isRefreshing ? 1 : Math.min(progress * 1.5, 1),
      }}
    >
      {isRefreshing ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-xs">{t("刷新中...")}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground">
          <ArrowDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isReady ? "rotate-180 text-primary" : ""
            }`}
          />
          <span className="text-xs">
            {isReady ? t("松手刷新") : t("下拉刷新")}
          </span>
        </div>
      )}
    </div>
  );
}
