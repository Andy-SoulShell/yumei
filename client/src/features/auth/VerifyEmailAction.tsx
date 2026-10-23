/** Request verification for the current account without losing the task being completed. */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { authCallbackUrl } from "@/lib/auth-navigation";
import { formDraftEpoch } from "@/lib/formDrafts";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "./auth-error";
export function VerifyEmailAction({ returnTo }: { returnTo: string }) {
  const { user } = useAuth(),
    { t, locale } = useI18n();
  const [pending, setPending] = useState(false),
    [cooldown, setCooldown] = useState(0),
    [notice, setNotice] = useState("");
  const busy = useRef(false),
    mounted = useRef(true),
    owner = useRef(user?.id);
  owner.current = user?.id;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(
      () => setCooldown(value => Math.max(0, value - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const send = async () => {
    if (!user || user.emailVerified || busy.current || cooldown) return;
    const id = user.id,
      epoch = formDraftEpoch(),
      valid = () =>
        mounted.current && owner.current === id && epoch === formDraftEpoch();
    busy.current = true;
    setPending(true);
    setNotice("");
    try {
      const result = await authClient.sendVerificationEmail({
        email: user.email,
        callbackURL: authCallbackUrl("verify", returnTo),
        fetchOptions: { headers: { "x-yumei-locale": locale } },
      });
      if (!valid()) return;
      if (result.error) {
        const message = authErrorMessage(result.error, t);
        setNotice(message);
        toast.error(message);
      } else {
        const message = t("auth:verificationSentDescription", {
          email: user.email,
        });
        setNotice(message);
        toast.success(message);
        setCooldown(60);
      }
    } catch {
      if (valid()) setNotice(t("auth:networkErrorPleaseTryAgain"));
    } finally {
      busy.current = false;
      if (valid()) setPending(false);
    }
  };
  if (!user || user.emailVerified) return null;
  return (
    <div className="space-y-2">
      <Button
        className="min-h-11"
        variant="outline"
        disabled={pending || cooldown > 0}
        onClick={() => void send()}
      >
        {pending
          ? t("auth:working")
          : cooldown
            ? t("auth:resendAfter", { seconds: cooldown })
            : t("economy:verifyAction")}
      </Button>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </div>
  );
}
