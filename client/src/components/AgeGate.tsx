/** 成年确认入口，根据用户出生日期状态控制弹窗。 */

import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
              <DialogTitle>{t("We can't let you in")}</DialogTitle>
              <DialogDescription>
                {t(
                  "YUMEI is an 18+ service and isn't available to minors. If you're going through a hard time, you're not alone — reach out to someone you trust, or find help at"
                )}{" "}
                <a
                  className="underline"
                  href="https://findahelpline.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("findahelpline.com")}
                </a>
                .
              </DialogDescription>
            </DialogHeader>
            <Button variant="outline" onClick={() => logout()}>
              {t("Sign out")}
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("Confirm your age")}</DialogTitle>
              <DialogDescription>
                {t(
                  "YUMEI is an adults-only (18+) service, and your companion is AI-generated — not a real person. Enter your date of birth to continue. We only use it to confirm you're an adult."
                )}
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
              <Input
                type="date"
                required
                value={birthDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setBirthDate(e.target.value)}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={confirmAge.isPending || !birthDate}
              >
                {confirmAge.isPending
                  ? t("Confirming…")
                  : t("I'm 18 or older — continue")}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
