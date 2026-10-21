/** 共享公开内容查询，发布后在刷新、重新聚焦或定时同步时更新。 */
import { useMemo } from "react";
import { localizeDiscovery } from "@shared/discovery";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";

/** 所有公开入口共用服务端发布数据，不使用源码角色库作为降级内容。 */
export function useDiscovery() {
  const { locale } = useI18n();
  const query = trpc.discovery.get.useQuery(undefined, {
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const data = useMemo(
    () => (query.data ? localizeDiscovery(query.data, locale) : undefined),
    [query.data, locale]
  );
  return {
    data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
