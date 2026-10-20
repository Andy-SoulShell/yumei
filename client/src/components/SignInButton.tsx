/** PC 原地打开认证弹框；手机和新标签页仍使用可直接访问的登录地址。 */
import { useRef, useState, type MouseEvent } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { AuthFlow } from "@/features/auth/AuthFlow";
import { useI18n } from "@/lib/i18n";
import { safeReturnTo } from "@/lib/navigation";
import { authUrl, type AuthMode } from "@/lib/auth-navigation";

/** 保留锚点的后备地址，桌面普通点击才切换为弹框。 */
export function SignInButton({
  returnTo,
  disabled,
  initialMode = "login",
  label,
  className = "header-signin",
}: {
  returnTo: string;
  disabled?: boolean;
  initialMode?: "login" | "register";
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const entry = useRef<HTMLAnchorElement>(null);
  const handleClick = (event: MouseEvent) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    if (
      window.matchMedia?.("(min-width: 901px)").matches ??
      window.innerWidth > 900
    ) {
      event.preventDefault();
      setMode(initialMode);
      setOpen(true);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button asChild className={className} disabled={disabled}>
        <Link
          ref={entry}
          href={authUrl(initialMode, returnTo)}
          onClick={handleClick}
        >
          {label ?? t("explore:signIn")}
          <ArrowRight />
        </Link>
      </Button>
      <DialogContent
        className="auth-dialog max-h-[calc(100dvh-3rem)] overflow-y-auto p-7 sm:max-w-[440px]"
        onCloseAutoFocus={event => {
          event.preventDefault();
          entry.current?.focus();
        }}
      >
        {open && (
          <AuthFlow
            mode={mode}
            onModeChange={setMode}
            returnTo={safeReturnTo(returnTo)}
            dialog
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
