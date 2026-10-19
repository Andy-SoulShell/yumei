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

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * 推送通知开关（M4-4）。她的主动消息（早安/惦记你的事）会推送到
 * 这台设备 —— 这是 M2 记忆系统的送达通道。运营方未配置 VAPID 密钥
 * 时整卡隐藏。
 */
export function PushCard() {
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
        toast.error("浏览器拒绝了通知权限");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.key!) as BufferSource,
      });
      const json = subscription.toJSON();
      await subscribeMutation.mutateAsync({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
      await utils.push.status.invalidate();
      toast.success("推送已开启，她想你的时候会告诉你～");
    } catch (e: any) {
      toast.error(`开启推送失败：${e?.message ?? e}`);
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
        await unsubscribeMutation.mutateAsync({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      await utils.push.status.invalidate();
      toast.success("推送已关闭");
    } catch (e: any) {
      toast.error(`关闭推送失败：${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          推送通知
        </CardTitle>
        <CardDescription>
          开启后，她的主动消息（早安、惦记着你说过的事）会推送到这台设备。每天最多 1 条。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status?.subscribed ? (
          <Button variant="outline" onClick={disable} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <BellOff className="w-4 h-4 mr-1.5" />}
            关闭本设备推送
          </Button>
        ) : (
          <Button onClick={enable} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Bell className="w-4 h-4 mr-1.5" />}
            开启推送
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
