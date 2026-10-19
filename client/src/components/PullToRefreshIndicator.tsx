import { Loader2, ArrowDown } from "lucide-react";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
  threshold?: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  isPulling,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
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
          <Loader2 className="w-4 h-4 animate-spin text-pink-500" />
          <span className="text-xs">刷新中...</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground">
          <ArrowDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isReady ? "rotate-180 text-pink-500" : ""
            }`}
          />
          <span className="text-xs">
            {isReady ? "松手刷新" : "下拉刷新"}
          </span>
        </div>
      )}
    </div>
  );
}
