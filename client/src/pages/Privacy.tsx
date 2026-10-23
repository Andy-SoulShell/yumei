import { PrivacySettings } from "@/features/settings/PrivacySettings";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
export default function Privacy() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <article className="mx-auto max-w-2xl space-y-6 p-5 pb-24">
      <h1 className="text-2xl font-semibold">{t("privacy:title")}</h1>
      {(
        [
          ["noticeTitle", "noticeBody"],
          ["retentionTitle", "retentionBody"],
          ["localTitle", "localBody"],
        ] as const
      ).map(([title, body]) => (
        <section key={title} className="space-y-2">
          <h2 className="text-lg font-medium">{t(`privacy:${title}`)}</h2>
          <p className="leading-relaxed text-muted-foreground">
            {t(`privacy:${body}`)}
          </p>
        </section>
      ))}
      <p>{t("privacy:exportHelp")}</p>
      {user && <PrivacySettings />}
      <div className="flex flex-wrap gap-5">
        <Link href="/settings" className="text-primary underline">
          {t("privacy:title")}
        </Link>
        <Link href="/help" className="text-primary underline">
          {t("privacy:helpLink")}
        </Link>
      </div>
    </article>
  );
}
