/** 收藏保存到当前账号，访客先登录；所有入口共享同一份查询与保存反馈。 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { loginUrl } from "@/lib/navigation";

type Collection = {
  ids: readonly string[];
  busy: string | null;
  loading: boolean;
  error: boolean;
  toggle: (id: string) => void;
  retry: () => void;
};
const CollectionContext = createContext<Collection>({
  ids: [],
  busy: null,
  loading: false,
  error: false,
  toggle: () => {},
  retry: () => {},
});
export const useCharacterCollection = () => useContext(CollectionContext);

export function CharacterCollectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const search = useSearch();
  if (user?.id)
    return (
      <AccountCollection key={user.id} accountId={user.id}>
        {children}
      </AccountCollection>
    );
  return (
    <CollectionContext.Provider
      value={{
        ids: [],
        busy: null,
        loading: false,
        error: false,
        retry: () => {},
        toggle: id => {
          const params = new URLSearchParams(search);
          params.set("character", id);
          navigate(loginUrl(location + "?" + params));
        },
      }}
    >
      {children}
    </CollectionContext.Provider>
  );
}

function AccountCollection({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const query = trpc.discovery.favorites.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const utils = trpc.useUtils();
  const mutation = trpc.discovery.setFavorite.useMutation();
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { user } = useAuth();
  const owner = useRef(user?.id);
  owner.current = user?.id;
  const toggle = async (id: string) => {
    if (lock.current || query.isLoading || !query.data) return;
    lock.current = true;
    setBusy(id);
    const active = !query.data.includes(id);
    try {
      const ids = await mutation.mutateAsync({ id, active });
      if (!mounted.current || owner.current !== accountId) return;
      utils.discovery.favorites.setData(undefined, ids);
      toast.success(t(active ? "studio:saved" : "studio:unsaved"));
    } catch {
      if (mounted.current && owner.current === accountId)
        toast.error(t("studio:saveFailed"));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  return (
    <CollectionContext.Provider
      value={{
        ids: query.data ?? [],
        busy,
        loading: query.isLoading,
        error: !!query.error,
        toggle: id => void toggle(id),
        retry: () => void query.refetch(),
      }}
    >
      {children}
    </CollectionContext.Provider>
  );
}
