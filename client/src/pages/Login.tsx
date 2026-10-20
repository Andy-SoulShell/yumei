/** 手机认证页面、邮件回调，以及桌面可直接访问的认证弹框路由。 */
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AuthFlow } from "@/features/auth/AuthFlow";
import { useDesktopAuth } from "@/hooks/useDesktopAuth";
import {
  authDismissUrl,
  authModeForPath,
  authUrl,
  type AuthMode,
} from "@/lib/auth-navigation";
import { safeReturnTo } from "@/lib/navigation";
import { useI18n } from "@/lib/i18n";
import Landing from "./Landing";

/** 邮件验证和重置始终是独立页面，方便从任意邮箱客户端打开。 */
export default function Login() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const { t } = useI18n();
  const desktop = useDesktopAuth();
  const mode = authModeForPath(location) ?? "login";
  const returnTo = safeReturnTo(new URLSearchParams(search).get("next"));
  const onModeChange = (next: AuthMode) => navigate(authUrl(next, returnTo));
  if (desktop && mode !== "verify" && mode !== "reset")
    return (
      <AppShell>
        <Landing />
        <Dialog
          open
          onOpenChange={open => {
            if (!open) navigate(authDismissUrl(returnTo), { replace: true });
          }}
        >
          <DialogContent className="auth-dialog max-h-[calc(100dvh-3rem)] overflow-y-auto p-7 sm:max-w-[440px]">
            <AuthFlow
              mode={mode}
              returnTo={returnTo}
              onModeChange={onModeChange}
              dialog
            />
          </DialogContent>
        </Dialog>
      </AppShell>
    );
  return (
    <div className="login-page auth-page flex items-center">
      <div className="w-full max-w-md space-y-4 p-6 sm:p-8">
        <AuthFlow mode={mode} returnTo={returnTo} onModeChange={onModeChange} />
        <Button asChild variant="ghost" className="w-full">
          <Link href="/explore">
            <ArrowLeft />
            {t("explore:navExplore")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
