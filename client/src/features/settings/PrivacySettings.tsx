import { useEffect, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { clearFormDrafts } from "@/lib/formDrafts";
import { clearChatStreamDrafts } from "@/lib/chatStreamDrafts";
import { clearPrivateMediaCaches } from "@/lib/privateMediaCache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
export function PrivacySettings() {
  const { t, locale } = useI18n(),
    { user } = useAuth();
  const [token, setToken] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get("deleteToken") ??
      ""
  );
  const [open, setOpen] = useState(Boolean(token)),
    [email, setEmail] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState("");
  const eligibility = trpc.privacy.eligibility.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const download = trpc.privacy.export.useMutation(),
    send = trpc.privacy.requestDeletion.useMutation(),
    remove = trpc.privacy.deleteAccount.useMutation();
  useEffect(() => {
    if (window.location.hash.includes("deleteToken="))
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search
      );
  }, []);
  const exportData = async () => {
    setError("");
    try {
      const data = await download.mutateAsync();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `yumei-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(t("privacy:exportFailed"));
    }
  };
  return (
    <Card id="privacy">
      <CardHeader>
        <CardTitle>{t("privacy:title")}</CardTitle>
        <CardDescription>{t("privacy:intro")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Link href="/privacy" className="text-sm text-primary underline">
          {t("privacy:noticeTitle")}
        </Link>
        <p className="text-sm text-muted-foreground">
          {t("privacy:exportHelp")}
        </p>
        <Button
          variant="outline"
          disabled={download.isPending}
          onClick={() => void exportData()}
        >
          {t("privacy:export")}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">{t("privacy:deleteAccount")}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("privacy:deleteAccount")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("privacy:deleteWarning")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {eligibility.isLoading ? (
              <p role="status">{t("auth:working")}</p>
            ) : eligibility.error ? (
              <Button
                variant="outline"
                onClick={() => void eligibility.refetch()}
              >
                {t("explore:retry")}
              </Button>
            ) : !eligibility.data?.allowed ? (
              <p role="status">{t("privacy:cancelFirst")}</p>
            ) : (
              <>
                <Button
                  disabled={send.isPending}
                  onClick={() => {
                    setError("");
                    send.mutate(
                      { locale },
                      { onError: () => setError(t("privacy:requestFailed")) }
                    );
                  }}
                >
                  {t("privacy:sendConfirmation")}
                </Button>
                {send.isSuccess && (
                  <p role="status" className="text-sm">
                    {t("privacy:emailSent")}
                  </p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="delete-email">
                    {t("privacy:emailLabel")}
                  </Label>
                  <Input
                    id="delete-email"
                    type="email"
                    autoComplete="off"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete-token">
                    {t("privacy:tokenLabel")}
                  </Label>
                  <Input
                    id="delete-token"
                    autoComplete="off"
                    value={token}
                    onChange={e => setToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("privacy:tokenHelp")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm">
                    {t("privacy:confirmLabel")}
                  </Label>
                  <Input
                    id="delete-confirm"
                    autoComplete="off"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                  />
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={remove.isPending}>
                {t("common:cancel")}
              </AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={
                  !eligibility.data?.allowed ||
                  remove.isPending ||
                  confirm !== "DELETE" ||
                  email !== user?.email ||
                  !/^[a-f0-9]{48}$/.test(token)
                }
                onClick={() => {
                  setError("");
                  remove.mutate(
                    { token, email, confirm: "DELETE" },
                    {
                      onError: () => setError(t("privacy:deleteFailed")),
                      onSuccess: async ({ receipt }) => {
                        clearFormDrafts();
                        clearChatStreamDrafts();
                        await clearPrivateMediaCaches().catch(() => {});
                        window.location.assign(
                          `/data-deletion#receipt=${receipt}`
                        );
                      },
                    }
                  );
                }}
              >
                {t("privacy:deleteAccount")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
