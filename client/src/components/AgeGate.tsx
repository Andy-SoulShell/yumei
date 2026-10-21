import { useProductConfig } from "@/features/product/useProductConfig";
/** 成年确认入口，根据用户出生日期状态控制弹窗。 */

import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 引导已登录且尚未确认年龄的用户提交出生日期。
 *
 * @remarks 成年条件仍由服务端校验，前端弹窗不构成独立权限保障。
 */
export function AgeGate() {
  const sitePolicy = useProductConfig();
  const { t } = useI18n();
  const { user, refresh, logout } = useAuth();
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");
  const [underage, setUnderage] = useState(false);

  const confirmAge = trpc.auth.confirmAge.useMutation({
    onSuccess: async () => {
      await refresh();
    },
    onError: err => {
      if (err.data?.code === "FORBIDDEN") {
        setUnderage(true);
      } else {
        setError(err.message);
      }
    },
  });

  /** 受控的展开状态，实际状态由父组件维护。 */
  const open = Boolean(user) && !(user as any)?.birthDate;
  if (!open) return null;

  return (
    <Dialog open>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        {underage ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("auth:weCanTLetYouIn")}</DialogTitle>
              <DialogDescription>
                {t("auth:yumeiIsAn18ServiceAndIsnT")}{" "}
                <a
                  className="underline"
                  href={sitePolicy.raw?.site.links.support}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("common:findahelplineCom")}
                </a>
                .
              </DialogDescription>
            </DialogHeader>
            <Button variant="outline" onClick={() => logout()}>
              {t("auth:signOut")}
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("auth:confirmYourAge")}</DialogTitle>
              <DialogDescription>
                {t("auth:yumeiIsAnAdultsOnly18ServiceAnd")}
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-3"
              onSubmit={e => {
                e.preventDefault();
                setError("");
                confirmAge.mutate({ birthDate });
              }}
            >
              <Label htmlFor="birth-date">{t("auth:dateOfBirth")}</Label>
              <DatePicker
                id="birth-date"
                label={t("auth:dateOfBirth")}
                value={birthDate}
                onValueChange={setBirthDate}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={confirmAge.isPending || !birthDate}
              >
                {confirmAge.isPending
                  ? t("auth:confirming")
                  : t("auth:iM18OrOlderContinue")}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
