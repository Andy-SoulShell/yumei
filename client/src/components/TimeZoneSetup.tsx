/** 首次确认账号时区后再挂载业务页，避免第一轮记忆使用错误日历。 */
import { useState, type ReactNode } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { deviceTimeZone } from "@/lib/timeZone";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { TimeZonePicker } from "./TimeZonePicker";
import { PageError } from "./PageError";
import { Loader2 } from "lucide-react";

export function TimeZoneSetup({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { logout } = useAuth();
  const query = trpc.notification.preferences.useQuery(undefined, {
    retry: false,
  });
  const utils = trpc.useUtils();
  const [zone, setZone] = useState(deviceTimeZone);
  const [failed, setFailed] = useState(false);
  const save = trpc.notification.initializeTimeZone.useMutation({
    onSuccess: data => {
      utils.notification.preferences.setData(undefined, data);
      void utils.memory.state.invalidate();
    },
    onError: () => setFailed(true),
  });
  if (query.isLoading)
    return (
      <div role="status" className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin" aria-label={t("auth:working")} />
      </div>
    );
  if (!query.data) return <PageError onRetry={() => void query.refetch()} />;
  if (query.data.timeZoneInitialized) return children;
  return (
    <Dialog open>
      <DialogContent
        className="max-w-md"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{t("settings:timeZoneSetupTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings:timeZoneSetupDescription")}
          </DialogDescription>
        </DialogHeader>
        <TimeZonePicker
          id="initial-timezone"
          value={zone}
          onChange={setZone}
          disabled={save.isPending}
        />
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t("auth:networkErrorPleaseTryAgain")}
          </p>
        )}
        <Button
          disabled={save.isPending}
          onClick={() => {
            setFailed(false);
            save.mutate({ timeZone: zone });
          }}
        >
          {t(save.isPending ? "common:saving" : "settings:timeZoneConfirm")}
        </Button>
        <Button
          variant="ghost"
          disabled={save.isPending}
          onClick={() => {
            void logout().catch(() => setFailed(true));
          }}
        >
          {t("auth:signOut")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
