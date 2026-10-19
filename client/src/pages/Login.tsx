/** 邮箱链接登录页面，使用同源 Better-Auth 客户端发起登录。 */

import { LanguagePicker } from "@/components/AppearanceSettings";
import { useI18n } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowLeft, Sparkles } from "lucide-react";
import { safeReturnTo } from "@/lib/navigation";

/**
 * 收集邮箱并请求登录链接，展示发送状态与失败信息。
 *
 * @remarks 实际发信行为由服务端驱动决定，stdout 模式仅将链接写入本地日志。
 */
export default function Login() {
  const { t, locale } = useI18n();
  const search = useSearch();
  const returnTo = safeReturnTo(new URLSearchParams(search).get("next"));
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: authError } = await authClient.signIn.magicLink({
        email,
        callbackURL: returnTo,
        fetchOptions: { headers: { "x-yumei-locale": locale } },
      });
      if (authError) {
        setError(t("common:failedToSendMagicLink"));
      } else {
        setSent(true);
      }
    } catch {
      setError(t("auth:networkErrorPleaseTryAgain"));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-6 p-8 max-w-md w-full">
          <LanguagePicker />
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            {t("auth:checkYourInbox")}
          </h1>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            {t("auth:linkSent", { email })}
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
          >
            {t("auth:useADifferentEmail")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-6 p-8 max-w-md w-full">
        <Link href="/" className="app-brand">
          <Sparkles size={24} />
          YUMEI<span className="brand-period">.</span>
        </Link>
        <LanguagePicker />
        <h1 className="text-2xl font-semibold tracking-tight text-center">
          {t("auth:signInToContinue")}
        </h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {t("auth:enterYourEmailAndWeLlSendYou")}
        </p>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <Input
            type="email"
            placeholder={t("auth:youExampleCom")}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? t("auth:sending") : t("auth:sendMagicLink")}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          {t("auth:guide18OnlyCompanionsOnYUMEIAreAIGenerated")}
        </p>
        <Button asChild variant="ghost">
          <Link href="/">
            <ArrowLeft />
            {t("explore:navExplore")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
