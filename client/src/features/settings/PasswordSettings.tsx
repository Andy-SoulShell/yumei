/** 账号密码管理；无密码的邮箱链接账号通过邮件设置密码。 */
import { useState, type FormEvent } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordField } from "@/features/auth/PasswordField";
import { authErrorMessage } from "@/features/auth/auth-error";
import { authClient } from "@/lib/auth-client";
import { authCallbackUrl } from "@/lib/auth-navigation";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import {
  isValidPasswordLength,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@shared/auth";

/** 密码修改独立保存，成功后清空表单并撤销其他会话。 */
export function PasswordSettings() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const status = trpc.auth.passwordStatus.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || pending) return;
    setError("");
    setMessage("");
    if (status.data?.hasPassword) {
      if (!isValidPasswordLength(password)) {
        setError(
          t("auth:passwordRules", {
            min: PASSWORD_MIN_LENGTH,
            max: PASSWORD_MAX_LENGTH,
          })
        );
        return;
      }
      if (password !== confirmPassword) {
        setError(t("auth:passwordMismatch"));
        return;
      }
    }
    setPending(true);
    try {
      const fetchOptions = { headers: { "x-yumei-locale": locale } };
      const result = status.data?.hasPassword
        ? await authClient.changePassword({
            currentPassword,
            newPassword: password,
            revokeOtherSessions: true,
            fetchOptions,
          })
        : await authClient.requestPasswordReset({
            email: user.email,
            redirectTo: authCallbackUrl("reset", "/settings"),
            fetchOptions,
          });
      if (result.error) {
        setError(authErrorMessage(result.error, t));
        return;
      }
      if (status.data?.hasPassword) {
        setCurrentPassword("");
        setPassword("");
        setConfirmPassword("");
        setMessage(t("auth:passwordChanged"));
      } else {
        setSent(true);
        setMessage(t("auth:resetSentDescription", { email: user.email }));
      }
    } catch {
      setError(t("auth:networkErrorPleaseTryAgain"));
    } finally {
      setPending(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("auth:passwordSecurity")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status.isError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              {t("auth:passwordLoadFailed")}
            </p>
            <Button variant="outline" onClick={() => void status.refetch()}>
              {t("explore:retry")}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
            {status.data?.hasPassword ? (
              <>
                <PasswordField
                  name="currentPassword"
                  label={t("auth:currentPassword")}
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  disabled={pending}
                  autoComplete="current-password"
                />
                <PasswordField
                  name="newPassword"
                  label={t("auth:newPassword")}
                  value={password}
                  onChange={setPassword}
                  disabled={pending}
                />
                <PasswordField
                  name="confirmPassword"
                  label={t("auth:confirmPassword")}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  disabled={pending}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("auth:setPasswordDescription")}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="text-sm text-primary">
                {message}
              </p>
            )}
            <Button
              type="submit"
              variant="outline"
              disabled={pending || status.isLoading || sent}
            >
              {t(
                pending
                  ? "auth:working"
                  : status.data?.hasPassword
                    ? "auth:savePassword"
                    : "auth:setPassword"
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
