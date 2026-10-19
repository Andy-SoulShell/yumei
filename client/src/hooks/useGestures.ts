import { useEffect, useRef, useCallback, useState } from "react";
import { useLocation } from "wouter";

/**
 * 左滑返回手势 Hook
 * 从屏幕左边缘开始向右滑动触发返回
 */
export function useSwipeBack(options?: { enabled?: boolean; threshold?: number }) {
  const { enabled = true, threshold = 80 } = options ?? {};
  const [, navigate] = useLocation();
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchCurrentX = useRef(0);
  const isSwipingBack = useRef(false);
  const indicatorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // 创建滑动指示器
    const indicator = document.createElement("div");
    indicator.style.cssText = `
      position: fixed;
      top: 50%;
      left: 0;
      transform: translateY(-50%) translateX(-100%);
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ec4899, #a855f7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      transition: opacity 0.15s ease;
      opacity: 0;
      pointer-events: none;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    indicator.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;
    document.body.appendChild(indicator);
    indicatorRef.current = indicator;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      // 只在屏幕左边缘 30px 内开始的触摸才触发
      if (touch.clientX <= 30) {
        touchStartX.current = touch.clientX;
        touchStartY.current = touch.clientY;
        isSwipingBack.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isSwipingBack.current) return;

      const touch = e.touches[0];
      touchCurrentX.current = touch.clientX;
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = Math.abs(touch.clientY - touchStartY.current);

      // 如果纵向滑动大于横向，取消返回手势
      if (deltaY > deltaX * 1.5) {
        isSwipingBack.current = false;
        if (indicatorRef.current) {
          indicatorRef.current.style.opacity = "0";
          indicatorRef.current.style.transform = "translateY(-50%) translateX(-100%)";
        }
        return;
      }

      if (deltaX > 10 && indicatorRef.current) {
        const progress = Math.min(deltaX / threshold, 1);
        const translateX = Math.min(deltaX - 20, 30);
        indicatorRef.current.style.opacity = String(progress);
        indicatorRef.current.style.transform = `translateY(-50%) translateX(${translateX}px) scale(${0.6 + progress * 0.4})`;

        if (progress >= 1) {
          indicatorRef.current.style.background = "linear-gradient(135deg, #22c55e, #10b981)";
        } else {
          indicatorRef.current.style.background = "linear-gradient(135deg, #ec4899, #a855f7)";
        }
      }
    };

    const handleTouchEnd = () => {
      if (!isSwipingBack.current) return;

      const deltaX = touchCurrentX.current - touchStartX.current;

      if (deltaX >= threshold) {
        // 触发返回
        window.history.back();
      }

      // 重置指示器
      if (indicatorRef.current) {
        indicatorRef.current.style.opacity = "0";
        indicatorRef.current.style.transform = "translateY(-50%) translateX(-100%)";
      }

      isSwipingBack.current = false;
      touchStartX.current = 0;
      touchStartY.current = 0;
      touchCurrentX.current = 0;
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      if (indicatorRef.current && indicatorRef.current.parentNode) {
        indicatorRef.current.parentNode.removeChild(indicatorRef.current);
      }
    };
  }, [enabled, threshold, navigate]);
}

/**
 * 下拉刷新 Hook
 * 在页面顶部下拉触发刷新回调
 */
export function usePullToRefresh(options: {
  onRefresh: () => Promise<void> | void;
  enabled?: boolean;
  threshold?: number;
  containerRef?: React.RefObject<HTMLElement | null>;
}) {
  const { onRefresh, enabled = true, threshold = 80, containerRef } = options;
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPullingRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef?.current || document.documentElement;

    const handleTouchStart = (e: TouchEvent) => {
      // 只在滚动到顶部时才触发下拉刷新
      const scrollTop = containerRef?.current
        ? containerRef.current.scrollTop
        : window.scrollY || document.documentElement.scrollTop;

      if (scrollTop <= 0 && !isRefreshing) {
        touchStartY.current = e.touches[0].clientY;
        isPullingRef.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshing) return;

      const deltaY = e.touches[0].clientY - touchStartY.current;

      if (deltaY > 0) {
        // 使用阻尼效果
        const dampedDistance = Math.min(deltaY * 0.4, threshold * 1.5);
        setPullDistance(dampedDistance);
        setIsPulling(true);
      } else {
        isPullingRef.current = false;
        setPullDistance(0);
        setIsPulling(false);
      }
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current) return;

      if (pullDistance >= threshold) {
        handleRefresh();
      } else {
        setPullDistance(0);
        setIsPulling(false);
      }

      isPullingRef.current = false;
    };

    const target = containerRef?.current || document;
    target.addEventListener("touchstart", handleTouchStart as EventListener, { passive: true });
    target.addEventListener("touchmove", handleTouchMove as EventListener, { passive: true });
    target.addEventListener("touchend", handleTouchEnd as EventListener, { passive: true });

    return () => {
      target.removeEventListener("touchstart", handleTouchStart as EventListener);
      target.removeEventListener("touchmove", handleTouchMove as EventListener);
      target.removeEventListener("touchend", handleTouchEnd as EventListener);
    };
  }, [enabled, threshold, isRefreshing, pullDistance, handleRefresh, containerRef]);

  return { isPulling, pullDistance, isRefreshing };
}
