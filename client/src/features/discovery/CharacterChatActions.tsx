import { useId } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Heart, Loader2 } from "lucide-react";
import type { CharacterPreset } from "@shared/discovery";
import { useAuth } from "@/_core/hooks/useAuth";
import type { useCompanionChat } from "@/hooks/useCompanionChat";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

type Props = {
  selected: CharacterPreset;
  chat: ReturnType<typeof useCompanionChat>;
};

/** 继续已有角色不受新增名额影响；游客保留原有登录后返回流程。 */
export function CharacterChatActions(props: Props) {
  const { isAuthenticated, loading } = useAuth();
  const { t } = useI18n();
  const owned = Boolean(props.chat.findPreset(props.selected));
  if (isAuthenticated && !owned) return <NewCharacterActions {...props} />;
  return (
    <ChatActionButtons
      {...props}
      owned={owned}
      disabled={loading}
      notice={t(owned ? "explore:alreadyAdded" : "explore:guestCharacterHint")}
    />
  );
}

/** 只在查看待添加角色时读取实际套餐，不用公开配置猜测用户权益。 */
function NewCharacterActions(props: Props) {
  const { t } = useI18n();
  const billing = trpc.billing.getInfo.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const { companions, error, refetch } = props.chat;
  const failed = (!billing.data && billing.error) || (!companions && error);
  if (failed)
    return (
      <>
        <p role="alert" className="detail-disclosure">
          {t("explore:capacityError")}
        </p>
        <Button
          variant="outline"
          onClick={() => void Promise.all([billing.refetch(), refetch()])}
        >
          {t("explore:retry")}
        </Button>
      </>
    );
  const ready = Boolean(billing.data && companions);
  const limit =
    billing.data?.mode === "none" ? null : billing.data?.limits.maxGirlfriends;
  const remaining =
    limit == null ? null : Math.max(0, limit - (companions?.length ?? 0));
  const full = ready && remaining === 0;
  const notice = !ready
    ? t("explore:checkingCapacity")
    : full
      ? t("explore:characterCapacityFull", { count: limit! })
      : remaining === null
        ? t("explore:characterCapacityUnlimited")
        : t("explore:characterCapacityRemaining", { count: remaining });
  return (
    <ChatActionButtons
      {...props}
      notice={notice}
      disabled={!ready}
      full={full}
    />
  );
}

function ChatActionButtons({
  selected,
  chat,
  notice,
  disabled = false,
  owned = false,
  full = false,
}: Props & {
  notice: string;
  disabled?: boolean;
  owned?: boolean;
  full?: boolean;
}) {
  const { t } = useI18n();
  const noticeId = useId();
  const busy = chat.pending !== null;
  return (
    <>
      <p id={noticeId} className="detail-disclosure" role="status">
        {notice}
      </p>
      {full ? (
        <Button className="detail-start" asChild aria-describedby={noticeId}>
          <Link href="/characters">
            {t("explore:manageRoles")}
            <ArrowRight />
          </Link>
        </Button>
      ) : (
        <Button
          className="detail-start"
          disabled={disabled || busy}
          aria-describedby={noticeId}
          onClick={() => void chat.open(selected)}
        >
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : owned ? (
            <Check />
          ) : (
            <Heart />
          )}
          {t(
            busy
              ? "explore:opening"
              : owned
                ? "explore:continueChat"
                : "explore:addChat"
          )}
          <ArrowRight />
        </Button>
      )}
      {!full &&
        (busy ? (
          <Button variant="ghost" disabled>
            {t("explore:customizeCharacter")}
          </Button>
        ) : (
          <Button variant="ghost" asChild>
            <Link href={"/setup?preset=" + selected.id}>
              {t("explore:customizeCharacter")}
            </Link>
          </Button>
        ))}
    </>
  );
}
