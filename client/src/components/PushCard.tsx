/** 当前浏览器的 Web Push 订阅开关与授权提示。 */

import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** 将 VAPID 公钥的 base64url 文本转换为浏览器推送接口接受的字节。 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** 在浏览器支持且配置公钥时显示推送开关，保存或移除本设备订阅。 */
export function PushCard() {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const { data: status } = trpc.push.status.useQuery();
  const { data: keyData } = trpc.push.publicKey.useQuery();
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();
  const [busy, setBusy] = useState(false);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  if (!keyData?.key || !supported) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error(t("notifications:notificationPermissionWasDenied"));
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          keyData.key!
        ) as BufferSource,
      });
      const json = subscription.toJSON();
      await subscribeMutation.mutateAsync({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
      await utils.push.status.invalidate();
      toast.success(t("notifications:pushNotificationsEnabled"));
    } catch (e: any) {
      toast.error(
        t("notifications:couldNotEnableNotifications", {
          error: e?.message ?? e,
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeMutation.mutateAsync({
          endpoint: subscription.endpoint,
        });
        await subscription.unsubscribe();
      }
      await utils.push.status.invalidate();
      toast.success(t("notifications:pushNotificationsDisabled"));
    } catch (e: any) {
      toast.error(
        t("notifications:couldNotDisableNotifications", {
          error: e?.message ?? e,
        })
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          {t("notifications:pushNotifications")}
        </CardTitle>
        <CardDescription>
          {t("notifications:receiveProactiveMessagesOnThisDeviceSuchAs")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status?.subscribed ? (
          <Button variant="outline" onClick={disable} disabled={busy}>
            {busy ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <BellOff className="w-4 h-4 mr-1.5" />
            )}
            {t("notifications:disablePushOnThisDevice")}
          </Button>
        ) : (
          <Button onClick={enable} disabled={busy}>
            {busy ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Bell className="w-4 h-4 mr-1.5" />
            )}
            {t("notifications:enablePush")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
