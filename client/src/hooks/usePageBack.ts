import { useCallback } from "react";
import { useLocation } from "wouter";
import { hasAppBackEntry } from "@/lib/app-history";

export function usePageBack(fallback: string) {
  const [, navigate] = useLocation();
  return useCallback(() => {
    if (hasAppBackEntry()) window.history.back();
    else navigate(fallback, { replace: true });
  }, [fallback, navigate]);
}
