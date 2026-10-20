/** 移动端边缘返回与下拉刷新手势，负责注册和移除 DOM 监听器。 */

import { useEffect, useRef, useCallback, useState } from "react";
import { usePageBack } from "./usePageBack";

/**
 * 监听从左边缘向右滑动的手势，达到阈值后调用浏览器历史返回。
 *
 * @param options - 是否启用，以及以像素为单位的触发距离
 * @remarks 卸载或配置变化时移除监听和临时指示器。
 */
export function useSwipeBack(options?: {
  enabled?: boolean;
  /** 触发阈值，单位为像素。 */
  threshold?: number;
}) {
  const { enabled = true, threshold = 80 } = options ?? {};
  const goBack = usePageBack("/");
  useEffect(() => {
    // iOS 已有系统边缘返回；网页重复处理会一次返回两层。
    if (!enabled || window.CSS?.supports("-webkit-touch-callout", "none"))
      return;
    let start: { x: number; y: number } | null = null;
    let distance = 0;
    const indicator = document.createElement("div");
    indicator.setAttribute("aria-hidden", "true");
    indicator.className = "swipe-back-indicator";
    indicator.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;
    document.body.appendChild(indicator);
    const reset = () => {
      start = null;
      distance = 0;
      indicator.style.opacity = "0";
      indicator.style.transform = "translate(-100%, -50%)";
    };
    const onStart = (event: TouchEvent) => {
      reset();
      const target = event.target as Element;
      if (
        event.touches.length !== 1 ||
        document.querySelector('[role="dialog"], [role="alertdialog"]') ||
        target.closest(
          'button,a,input,textarea,select,[role="slider"],[contenteditable="true"]'
        )
      )
        return;
      const touch = event.touches[0];
      if (touch.clientX <= 24) start = { x: touch.clientX, y: touch.clientY };
    };
    const onMove = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0];
      distance = touch.clientX - start.x;
      if (
        distance < 0 ||
        Math.abs(touch.clientY - start.y) > Math.max(12, distance)
      ) {
        reset();
        return;
      }
      indicator.style.opacity = String(Math.min(distance / threshold, 1));
      indicator.style.transform = `translate(${Math.min(distance - 40, 12)}px, -50%)`;
    };
    const onEnd = () => {
      const shouldGoBack = !!start && distance >= threshold;
      reset();
      if (shouldGoBack) goBack();
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
      indicator.remove();
    };
  }, [enabled, threshold, goBack]);
}

/**
 * 在容器顶部识别下拉手势，达到阈值后执行刷新并返回展示状态。
 *
 * @param options - 刷新回调、启用状态、像素阈值和可选滚动容器
 * @remarks 刷新失败时仍恢复视觉状态；调用方需要处理业务错误。
 */
export function usePullToRefresh(options: {
  onRefresh: () => Promise<void> | void;
  enabled?: boolean;
  /** 触发阈值，单位为像素。 */
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
    target.addEventListener("touchstart", handleTouchStart as EventListener, {
      passive: true,
    });
    target.addEventListener("touchmove", handleTouchMove as EventListener, {
      passive: true,
    });
    target.addEventListener("touchend", handleTouchEnd as EventListener, {
      passive: true,
    });

    return () => {
      target.removeEventListener(
        "touchstart",
        handleTouchStart as EventListener
      );
      target.removeEventListener("touchmove", handleTouchMove as EventListener);
      target.removeEventListener("touchend", handleTouchEnd as EventListener);
    };
  }, [
    enabled,
    threshold,
    isRefreshing,
    pullDistance,
    handleRefresh,
    containerRef,
  ]);

  return { isPulling, pullDistance, isRefreshing };
}
