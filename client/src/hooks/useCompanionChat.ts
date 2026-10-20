/** 将已有或预设角色接入现有会话恢复接口，防止重复点击创建。 */
import { useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { apiErrorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { loginUrl } from "@/lib/navigation";
import type { CharacterPreset } from "@shared/characterPresets";

/** 添加预设后恢复会话；接口失败时保留已创建角色以便重试。 */
export function useCompanionChat() {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const utils = trpc.useUtils();
  const {
    data: companions,
    isLoading,
    error,
    refetch,
  } = trpc.girlfriend.list.useQuery(undefined, { enabled: isAuthenticated });
  const create = trpc.girlfriend.create.useMutation();
  const resume = trpc.conversation.resume.useMutation();
  const busy = useRef(false);
  const [pending, setPending] = useState<string | number | null>(null);
  const findPreset = (preset: CharacterPreset) =>
    companions?.find(
      role =>
        role.name === preset.name &&
        role.personality === preset.personality &&
        role.appearance === preset.appearance
    );
  const open = async (role: number | CharacterPreset, selfie = false) => {
    if (busy.current) return;
    if (!isAuthenticated) {
      const params = new URLSearchParams(search);
      if (typeof role !== "number") params.set("character", role.id);
      const returnTo =
        typeof role === "number"
          ? "/characters"
          : (location === "/" || location === "/explore"
              ? location
              : "/explore") +
            "?" +
            params.toString();
      navigate(loginUrl(returnTo));
      return;
    }
    busy.current = true;
    setPending(typeof role === "number" ? role : role.id);
    try {
      let id: number;
      if (typeof role === "number") id = role;
      else {
        // 操作时读取最新列表，避免列表尚在加载或另一页刚创建时重复添加。
        const current = await utils.girlfriend.list.fetch();
        const existing = current.find(
          item =>
            item.name === role.name &&
            item.personality === role.personality &&
            item.appearance === role.appearance
        );
        if (existing) id = existing.id;
        else {
          const created = await create.mutateAsync({
            presetId: role.id,
            name: role.name,
            personality: role.personality,
            appearance: role.appearance,
            interests: role.interests,
          });
          id = created.id;
          await utils.girlfriend.invalidate();
        }
      }
      const conversation = await resume.mutateAsync({ girlfriendId: id });
      await utils.conversation.invalidate();
      navigate(`/chat/${conversation.id}${selfie ? "?selfie=1" : ""}`);
    } catch (error) {
      toast.error(
        apiErrorMessage(
          error instanceof Error
            ? error
            : { message: t("auth:networkErrorPleaseTryAgain") },
          t
        ),
        {
          action: {
            label: t("explore:manageRoles"),
            onClick: () => navigate("/characters"),
          },
        }
      );
    } finally {
      busy.current = false;
      setPending(null);
    }
  };
  return { companions, isLoading, error, refetch, pending, findPreset, open };
}
