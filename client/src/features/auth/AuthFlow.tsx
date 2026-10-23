/** 桌面弹框与手机页面共用的认证表单和邮件结果反馈。 */
import { useId } from "react";
import { useSearch } from "wouter";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { LanguagePicker } from "@/components/AppearanceSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AuthMode } from "@/lib/auth-navigation";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@shared/auth";
import { PasswordField } from "./PasswordField";
import { useAuthFlow } from "./useAuthFlow";

/** 认证流程只收集必要字段；邮箱链接登录保留为次要入口。 */
export function AuthFlow(props: {
  mode: AuthMode;
  returnTo: string;
  onModeChange: (mode: AuthMode) => void;
  dialog?: boolean;
  onAuthenticated?: (returnTo: string) => void;
}) {
  const flow = useAuthFlow(props);
  const { t } = flow;
  const { mode } = props;
  const { user, loading } = useAuth();
  const query = new URLSearchParams(useSearch());
  const emailId = useId();
  const verified =
    mode === "verify" && !query.has("error") && Boolean(user?.emailVerified);
  const invalidReset =
    mode === "reset" && !flow.resetDone && (!flow.token || query.has("error"));
  const Title = props.dialog ? DialogTitle : "h1";
  const Description = props.dialog ? DialogDescription : "p";
  const title = flow.resetDone
    ? t("auth:resetSuccess")
    : flow.sent
      ? t("auth:checkYourInbox")
      : mode === "register"
        ? t("auth:registerTitle")
        : mode === "forgot"
          ? t("auth:forgotTitle")
          : mode === "reset"
            ? t(invalidReset ? "auth:invalidLink" : "auth:resetTitle")
            : mode === "verify"
              ? t(
                  loading
                    ? "auth:working"
                    : verified
                      ? "auth:verifiedTitle"
                      : "auth:invalidLink"
                )
              : mode === "magic"
                ? t("auth:magicLinkTitle")
                : t("auth:signInToContinue");
  const description = flow.resetDone
    ? t("auth:resetSuccessDescription")
    : flow.sent === "verification"
      ? t("auth:verificationSentDescription", { email: flow.email })
      : flow.sent === "reset"
        ? t("auth:resetSentDescription", { email: flow.email })
        : flow.sent === "magic"
          ? t("auth:linkSent", { email: flow.email })
          : mode === "register"
            ? t("auth:registerDescription")
            : mode === "forgot"
              ? t("auth:forgotDescription")
              : mode === "reset"
                ? t(
                    invalidReset
                      ? "auth:invalidLinkDescription"
                      : "auth:resetDescription"
                  )
                : mode === "verify"
                  ? t(
                      verified
                        ? "auth:verifiedDescription"
                        : "auth:invalidLinkDescription"
                    )
                  : mode === "magic"
                    ? t("auth:enterYourEmailAndWeLlSendYou")
                    : t("auth:loginDescription");
  const redundantDescription =
    !flow.sent &&
    !flow.resetDone &&
    !invalidReset &&
    (mode === "login" ||
      mode === "register" ||
      mode === "reset" ||
      mode === "magic");
  const backToLogin = (
    <Button
      type="button"
      variant="ghost"
      className="w-full"
      disabled={flow.pending}
      onClick={() => flow.changeMode("login")}
    >
      <ArrowLeft size={16} />
      {t("auth:backToLogin")}
    </Button>
  );
  const resendLabel = flow.cooldown
    ? t("auth:resendAfter", { seconds: flow.cooldown })
    : t("auth:resendVerification");
  const success = flow.resetDone || verified;
  const result =
    success ||
    Boolean(flow.sent) ||
    invalidReset ||
    (mode === "verify" && loading);
  return (
    <div className="auth-flow space-y-5">
      <div className="flex items-center justify-between gap-4 pr-6">
        <a href="/" className="app-brand" aria-label="YUMEI">
          YUMEI<span className="brand-period">.</span>
        </a>
        <LanguagePicker />
      </div>
      <div className="space-y-2">
        {(flow.sent || success) && (
          <div className="mb-3 text-primary">
            {success ? <CheckCircle2 size={32} /> : <Mail size={32} />}
          </div>
        )}
        <Title className="text-2xl font-semibold tracking-tight">{title}</Title>
        <Description
          className={
            redundantDescription
              ? "sr-only"
              : "text-sm leading-relaxed text-muted-foreground"
          }
        >
          {description}
        </Description>
      </div>
      {flow.error && (
        <p role="alert" className="text-sm text-destructive">
          {flow.error}
        </p>
      )}
      {result ? (
        <div className="space-y-3" aria-live="polite">
          {mode === "verify" && loading ? (
            <Loader2 className="animate-spin" />
          ) : verified ? (
            <Button
              className="h-11 w-full"
              onClick={() => flow.onAuthenticated(props.returnTo)}
            >
              {t("auth:continue")}
            </Button>
          ) : flow.sent === "verification" ? (
            <Button
              className="h-11 w-full"
              variant="outline"
              disabled={flow.pending || flow.cooldown > 0}
              onClick={() => void flow.resendVerification()}
            >
              {resendLabel}
            </Button>
          ) : flow.sent === "reset" || flow.sent === "magic" ? (
            <Button
              className="h-11 w-full"
              variant="outline"
              disabled={flow.pending || flow.cooldown > 0}
              onClick={() => void flow.submit()}
            >
              {flow.cooldown
                ? t("auth:resendAfter", { seconds: flow.cooldown })
                : t(
                    flow.sent === "magic"
                      ? "auth:sendMagicLink"
                      : "auth:sendResetLink"
                  )}
            </Button>
          ) : invalidReset ? (
            <Button
              className="h-11 w-full"
              onClick={() => flow.changeMode("forgot")}
            >
              {t("auth:sendResetLink")}
            </Button>
          ) : null}
          {!verified && !(mode === "verify" && loading) && backToLogin}
        </div>
      ) : (
        <form
          onSubmit={flow.submit}
          className="space-y-4"
          aria-busy={flow.pending}
        >
          {mode !== "reset" && (
            <div className="space-y-2">
              <Label htmlFor={emailId}>{t("auth:email")}</Label>
              <Input
                id={emailId}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={flow.email}
                onChange={event => flow.setEmail(event.target.value)}
                placeholder={t("auth:youExampleCom")}
                required
                disabled={flow.pending}
                autoFocus={props.dialog}
                className="h-11"
              />
            </div>
          )}
          {(mode === "login" || mode === "register" || mode === "reset") && (
            <PasswordField
              name="password"
              label={t(mode === "reset" ? "auth:newPassword" : "auth:password")}
              value={flow.password}
              onChange={flow.setPassword}
              disabled={flow.pending}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          )}
          {(mode === "register" || mode === "reset") && (
            <>
              <PasswordField
                name="confirmPassword"
                label={t("auth:confirmPassword")}
                value={flow.confirmPassword}
                onChange={flow.setConfirmPassword}
                disabled={flow.pending}
              />
              <p className="text-xs text-muted-foreground">
                {t("auth:passwordRules", {
                  min: PASSWORD_MIN_LENGTH,
                  max: PASSWORD_MAX_LENGTH,
                })}
              </p>
            </>
          )}
          {mode === "login" && (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="link"
                disabled={flow.pending}
                onClick={() => flow.changeMode("forgot")}
              >
                {t("auth:forgotPassword")}
              </Button>
            </div>
          )}
          <Button
            type="submit"
            className="h-11 w-full"
            disabled={
              flow.pending ||
              ((mode === "forgot" || mode === "magic" || mode === "verify") &&
                flow.cooldown > 0)
            }
          >
            {flow.pending ? (
              <>
                <Loader2 className="animate-spin" />
                {t("auth:working")}
              </>
            ) : (
              t(
                mode === "register"
                  ? "auth:createAccount"
                  : mode === "forgot"
                    ? "auth:sendResetLink"
                    : mode === "reset"
                      ? "auth:resetPassword"
                      : mode === "magic"
                        ? "auth:sendMagicLink"
                        : mode === "verify"
                          ? "auth:resendVerification"
                          : "auth:signIn"
              )
            )}
          </Button>
          {flow.needsVerification && (
            <Button
              type="button"
              className="w-full"
              variant="outline"
              disabled={flow.pending || flow.cooldown > 0}
              onClick={() => void flow.resendVerification()}
            >
              {resendLabel}
            </Button>
          )}
          {mode === "login" ? (
            <div className="space-y-2 pt-1">
              <p className="text-center text-sm text-muted-foreground">
                {t("auth:noAccount")}{" "}
                <Button
                  type="button"
                  variant="link"
                  disabled={flow.pending}
                  onClick={() => flow.changeMode("register")}
                >
                  {t("auth:createAccount")}
                </Button>
              </p>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                disabled={flow.pending}
                onClick={() => flow.changeMode("magic")}
              >
                <Mail size={16} />
                {t("auth:magicLinkLogin")}
              </Button>
            </div>
          ) : (
            backToLogin
          )}
        </form>
      )}
      <p className="pt-4 text-xs leading-relaxed text-muted-foreground">
        {t("auth:guide18OnlyCompanionsOnYUMEIAreAIGenerated")}{" "}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          {t("privacy:privacyLink")}
        </a>
        {" · "}
        <a
          href="/help"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          {t("privacy:helpLink")}
        </a>
      </p>
    </div>
  );
}
