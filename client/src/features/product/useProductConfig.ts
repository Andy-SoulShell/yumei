/** 前端共用业务配置查询，展示和服务端执行均读取当前发布快照。 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { localizeProductConfig } from "@shared/productConfig";

/** 保留原始快照供意图识别使用，多语言展示从同一数据生成。 */
export function useProductConfig() {
  const { locale } = useI18n();
  const query = trpc.productConfig.get.useQuery(undefined, {
    staleTime: 15000,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
  const data = useMemo(
    () => (query.data ? localizeProductConfig(query.data, locale) : undefined),
    [query.data, locale]
  );
  return { ...query, data, raw: query.data };
}
