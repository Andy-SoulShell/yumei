/** 认证表单状态与请求；桌面弹框和移动页面共享，密码仅保留在当前表单内存。 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearch } from "wouter";
import { authClient } from "@/lib/auth-client";
import { authCallbackUrl, authUrl, type AuthMode } from "@/lib/auth-navigation";
import { useI18n } from "@/lib/i18n";
import { safeReturnTo } from "@/lib/navigation";
import {
  isValidPasswordLength,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@shared/auth";
import { authErrorMessage, type AuthFailure } from "./auth-error";

/** 成功登录后重新进入应用，清除前一个会话留下的内存查询缓存。 */
export function finishAuthentication(returnTo: string) {
  window.location.assign(safeReturnTo(returnTo));
}

/** 驱动注册、登录、重置及邮件发送，不向日志或持久化存储写入密码。 */
export function useAuthFlow({
  mode,
  returnTo,
  onModeChange,
  onAuthenticated = finishAuthentication,
}: {
  mode: AuthMode;
  returnTo: string;
  onModeChange: (mode: AuthMode) => void;
  onAuthenticated?: (returnTo: string) => void;
}) {
  const { t, locale } = useI18n();
  const search = useSearch();
  const previousMode = useRef(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<"verification" | "reset" | "magic" | null>(
    null
  );
  const [resetDone, setResetDone] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [token, setToken] = useState(() =>
    mode === "reset"
      ? (new URLSearchParams(window.location.search).get("token") ?? "")
      : ""
  );
  const busy = useRef(false);
  const fetchOptions = { headers: { "x-yumei-locale": locale } };

  useEffect(() => {
    if (previousMode.current !== mode) {
      previousMode.current = mode;
      setError("");
      setSent(null);
      setResetDone(false);
      setNeedsVerification(false);
      setPassword("");
      setConfirmPassword("");
    }
    const incomingToken =
      mode === "reset" ? new URLSearchParams(search).get("token") : null;
    if (incomingToken) setToken(incomingToken);
  }, [mode, search]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(
      () => setCooldown(value => Math.max(0, value - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (
      mode === "reset" &&
      token &&
      new URLSearchParams(window.location.search).has("token")
    ) {
      // 邮件令牌捕获后从地址栏移除，避免留在浏览器历史或后续 Referer 中。
      window.history.replaceState(
        window.history.state,
        "",
        authUrl("reset", returnTo)
      );
    }
  }, [mode, token, returnTo]);

  const changeMode = (next: AuthMode) => {
    if (busy.current) return;
    setError("");
    setSent(null);
    setResetDone(false);
    setNeedsVerification(false);
    setPassword("");
    setConfirmPassword("");
    onModeChange(next);
  };
  const run = async (
    action: () => Promise<{ error: AuthFailure | null }>,
    success: () => void
  ) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await action();
      if (result.error) {
        setError(authErrorMessage(result.error, t));
        if (
          mode === "reset" &&
          ["INVALID_TOKEN", "TOKEN_EXPIRED"].includes(result.error.code ?? "")
        )
          setToken("");
        if (result.error.code === "EMAIL_NOT_VERIFIED")
          setNeedsVerification(true);
      } else success();
    } catch {
      setError(t("auth:networkErrorPleaseTryAgain"));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const resendVerification = () => {
    if (cooldown || !email.trim()) return Promise.resolve();
    return run(
      () =>
        authClient.sendVerificationEmail({
          email: email.trim(),
          callbackURL: authCallbackUrl("verify", returnTo),
          fetchOptions,
        }),
      () => {
        setSent("verification");
        setCooldown(60);
        setNeedsVerification(false);
      }
    );
  };
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy.current) return;
    if (mode === "register" || mode === "reset") {
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
    if (mode === "verify") return resendVerification();
    if (mode === "login") {
      return run(
        () =>
          authClient.signIn.email({
            email: email.trim(),
            password,
            fetchOptions,
          }),
        () => onAuthenticated(returnTo)
      );
    }
    if (mode === "register") {
      return run(
        () =>
          authClient.signUp.email({
            email: email.trim(),
            password,
            name: t("auth:defaultName"),
            callbackURL: authCallbackUrl("verify", returnTo),
            fetchOptions,
          }),
        () => {
          setSent("verification");
          setCooldown(60);
          setPassword("");
          setConfirmPassword("");
        }
      );
    }
    if (mode === "forgot") {
      if (cooldown) return;
      return run(
        () =>
          authClient.requestPasswordReset({
            email: email.trim(),
            redirectTo: authCallbackUrl("reset", returnTo),
            fetchOptions,
          }),
        () => {
          setSent("reset");
          setCooldown(60);
        }
      );
    }
    if (mode === "magic") {
      if (cooldown) return;
      return run(
        () =>
          authClient.signIn.magicLink({
            email: email.trim(),
            callbackURL: returnTo,
            fetchOptions,
          }),
        () => {
          setSent("magic");
          setCooldown(60);
        }
      );
    }
    if (!token) {
      setError(t("auth:invalidLink"));
      return;
    }
    return run(
      () =>
        authClient.resetPassword({
          token,
          newPassword: password,
          fetchOptions,
        }),
      () => {
        setResetDone(true);
        setPassword("");
        setConfirmPassword("");
        setToken("");
      }
    );
  };
  return {
    t,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    pending,
    sent,
    resetDone,
    needsVerification,
    cooldown,
    token,
    changeMode,
    submit,
    resendVerification,
    onAuthenticated,
  };
}
