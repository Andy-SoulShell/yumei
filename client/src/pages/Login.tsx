/** 邮箱链接登录页面，使用同源 Better-Auth 客户端发起登录。 */

import { LanguagePicker } from "@/components/AppearanceSettings";
import { useI18n } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

/**
 * 收集邮箱并请求登录链接，展示发送状态与失败信息。
 *
 * @remarks 实际发信行为由服务端驱动决定，stdout 模式仅将链接写入本地日志。
 */
export default function Login() {
  const { t, locale } = useI18n();
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
        callbackURL: "/",
        fetchOptions: { headers: { "x-yumei-locale": locale } },
      });
      if (authError) {
        setError(t(authError.message ?? "Failed to send magic link"));
      } else {
        setSent(true);
      }
    } catch {
      setError(t("Network error — please try again."));
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
            {t("Check your inbox")}
          </h1>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            {t("We sent a sign-in link to")}
            <strong>{email}</strong>
            {t(". Click the link in the email to continue.")}
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
          >
            {t("Use a different email")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-6 p-8 max-w-md w-full">
        <LanguagePicker />
        <h1 className="text-2xl font-semibold tracking-tight text-center">
          {t("Sign in to continue")}
        </h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {t("Enter your email and we'll send you a magic link.")}
        </p>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <Input
            type="email"
            placeholder={t("you@example.com")}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? t("Sending…") : t("Send magic link")}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          {t(
            "18+ only. Companions on YUMEI are AI-generated — not real people. We never train models on your conversations."
          )}
        </p>
      </div>
    </div>
  );
}
