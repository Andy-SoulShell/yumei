/** 统一读取当前用户、处理退出及可选的未登录跳转。 */

import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

/** 认证 Hook 的跳转选项；默认仅返回状态，不主动改变页面。 */
type UseAuthOptions = {
  /** 认证查询完成后，未登录时是否跳转，默认 false。 */
  redirectOnUnauthenticated?: boolean;
  /** 未登录时跳转的路径，默认 /login。 */
  redirectPath?: string;
};

/**
 * 订阅当前用户查询并提供刷新和退出操作。
 *
 * @remarks 退出会撤销服务端会话；成功后清除本地业务查询缓存，避免共享设备显示上一账号数据。
 */
export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } =
    options ?? {};
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      queryClient.clear();
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        queryClient.clear();
        utils.auth.me.setData(undefined, null);
        return;
      }
      throw error;
    }
  }, [logoutMutation, utils, queryClient]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
