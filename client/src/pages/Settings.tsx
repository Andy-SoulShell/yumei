/** 按用户任务组织设置，所有保存操作留在对应分区。 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Bell,
  Brain,
  CreditCard,
  HelpCircle,
  Loader2,
  Palette,
  Settings2,
  UserRound,
  Volume2,
} from "lucide-react";
import { PrivacySettings } from "@/features/settings/PrivacySettings";
import { SavedProviderKeys } from "@/features/settings/SavedProviderKeys";
import { usePageBack } from "@/hooks/usePageBack";
import { PageError } from "@/components/PageError";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { BillingCard } from "@/components/BillingCard";
import { PushCard } from "@/components/PushCard";
import { Button } from "@/components/ui/button";
import { BehaviorSettings } from "@/features/settings/BehaviorSettings";
import { ChatModelSettings } from "@/features/settings/ChatModelSettings";
import { ImageSettings } from "@/features/settings/ImageSettings";
import { TranscriptionSettings } from "@/features/settings/TranscriptionSettings";
import { useSettingsController } from "@/features/settings/useSettingsController";
import { VoiceSettings } from "@/features/settings/VoiceSettings";
import { PasswordSettings } from "@/features/settings/PasswordSettings";
import { ProfileSettings } from "@/features/settings/ProfileSettings";
import { ProactivePreferences } from "@/features/settings/ProactivePreferences";
import { SettingsSection } from "@/features/settings/SettingsSection";
import type { SettingsSaveSection } from "@/features/settings/SettingsSaveControl";
import "@/features/settings/settings.css";

const ids = [
  "chat",
  "voice",
  "appearance",
  "notifications",
  "billing",
  "account",
  "advanced",
  "model",
  "image",
  "transcription",
  "keys",
] as const;
type SectionId = (typeof ids)[number];
function hashSection(): SectionId | null {
  const hash = window.location.hash.slice(1);
  if (hash === "privacy" || hash.startsWith("deleteToken=")) return "account";
  return ids.includes(hash as SectionId) ? (hash as SectionId) : null;
}
function initialExpanded() {
  const section = hashSection();
  return {
    chat: !section || section === "chat",
    ...(section ? { [section]: true } : {}),
    ...(["model", "image", "transcription", "keys"].includes(section ?? "")
      ? { advanced: true }
      : {}),
  } as Partial<Record<SectionId, boolean>>;
}
export default function Settings() {
  const goBack = usePageBack("/characters");
  const state = useSettingsController();
  const { t, setVoiceExpanded, setServicesExpanded, setModelExpanded } = state;
  const [expanded, setExpanded] = useState(initialExpanded);
  useEffect(
    () => setVoiceExpanded(!!expanded.voice),
    [expanded.voice, setVoiceExpanded]
  );
  useEffect(
    () => setServicesExpanded(!!expanded.advanced),
    [expanded.advanced, setServicesExpanded]
  );
  useEffect(
    () => setModelExpanded(!!expanded.model),
    [expanded.model, setModelExpanded]
  );
  const navigateSection = useCallback((id: SectionId, writeHash = true) => {
    setExpanded(current => ({
      ...current,
      [id]: true,
      ...(["model", "image", "transcription", "keys"].includes(id)
        ? { advanced: true }
        : {}),
    }));
    if (writeHash)
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search + `#${id}`
      );
    requestAnimationFrame(() => {
      document.getElementById(`${id}-title`)?.focus({ preventScroll: true });
      document
        .getElementById(id)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }, []);
  useEffect(() => {
    const changed = () => {
      const id = hashSection();
      if (id) navigateSection(id, false);
    };
    changed();
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, [navigateSection]);
  const change = (id: SectionId) => (open: boolean) =>
    setExpanded(current => ({ ...current, [id]: open }));
  const summary = (section: SettingsSaveSection, dirty: boolean) => {
    const feedback = state.feedback[section];
    return feedback?.status === "saving"
      ? t("common:saving")
      : feedback?.status === "error" || feedback?.status === "partial"
        ? t("settingsFlow:needsAttention")
        : dirty
          ? t("settingsFlow:unsaved")
          : feedback?.status === "saved"
            ? t("settingsFlow:savedSection")
            : undefined;
  };
  const configuration = (children: ReactNode) =>
    state.isLoading ? (
      <p className="flex items-center gap-2 p-4 text-sm" role="status">
        <Loader2 className="size-4 animate-spin" />
        {t("auth:working")}
      </p>
    ) : !state.apiConfig ? (
      <PageError onRetry={() => void state.retryConfig()} />
    ) : (
      <>
        {state.configError && (
          <p role="alert" className="px-4 text-sm text-destructive">
            {t("settingsFlow:staleConfig")}
          </p>
        )}
        {children}
      </>
    );
  const common = [
    {
      id: "chat",
      icon: Brain,
      title: "chatTitle",
      description: "chatDescription",
      status: summary("behavior", state.hasUnsavedAiChanges),
      content: configuration(<BehaviorSettings {...state} />),
    },
    {
      id: "voice",
      icon: Volume2,
      title: "voiceTitle",
      description: "voiceDescription",
      status: summary("voice", state.hasUnsavedVoiceChanges),
      content: configuration(<VoiceSettings {...state} />),
    },
    {
      id: "appearance",
      icon: Palette,
      title: "appearanceTitle",
      description: "appearanceDescription",
      status: undefined,
      content: <AppearanceSettings />,
    },
  ] as const;
  const additional = [
    {
      id: "notifications",
      icon: Bell,
      title: "notificationsTitle",
      description: "notificationsDescription",
      content: (
        <>
          <p className="settings-scope">
            {t("settingsFlow:notificationsScope")}
          </p>
          <ProactivePreferences />
          <PushCard />
        </>
      ),
    },
    {
      id: "billing",
      icon: CreditCard,
      title: "billingTitle",
      description: "billingDescription",
      content: (
        <>
          <p className="settings-scope">{t("settingsFlow:billingScope")}</p>
          <BillingCard />
        </>
      ),
    },
    {
      id: "account",
      icon: UserRound,
      title: "accountTitle",
      description: "accountDescription",
      content: (
        <>
          <p className="settings-scope">{t("settingsFlow:accountScope")}</p>
          <ProfileSettings />
          <PasswordSettings />
          <PrivacySettings />
        </>
      ),
    },
  ] as const;
  return (
    <div className="settings-page min-h-full bg-background">
      <header className="page-toolbar sticky top-0 z-20 flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={t("setup:back")}
          onClick={goBack}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="min-w-0 flex-1 text-lg font-semibold">
          {t("common:settings")}
        </h1>
        <Button asChild variant="ghost" size="icon" className="size-11">
          <Link href="/help" aria-label={t("privacy:helpLink")}>
            <HelpCircle className="size-5" />
          </Link>
        </Button>
      </header>
      <div
        key={state.accountId}
        className="settings-content mx-auto max-w-2xl space-y-4 p-3 pb-8 sm:space-y-5 sm:p-5"
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("settingsFlow:intro")}
        </p>
        <nav
          aria-label={t("settingsFlow:shortcuts")}
          className="grid grid-cols-3 gap-2"
        >
          {[...common, ...additional].map(item => (
            <Button
              asChild
              key={item.id}
              variant="outline"
              className="h-auto min-h-12 whitespace-normal px-2 py-3 text-center text-xs"
            >
              <a
                href={`#${item.id}`}
                onClick={event => {
                  event.preventDefault();
                  navigateSection(item.id);
                }}
              >
                {t(`settingsFlow:${item.title}`)}
              </a>
            </Button>
          ))}
        </nav>
        <h2 className="pt-2 text-xs font-semibold tracking-wide text-muted-foreground">
          {t("settingsFlow:frequent")}
        </h2>
        {common.map(item => (
          <SettingsSection
            key={item.id}
            id={item.id}
            title={t(`settingsFlow:${item.title}`)}
            description={t(`settingsFlow:${item.description}`)}
            icon={item.icon}
            open={!!expanded[item.id]}
            onOpenChange={change(item.id)}
            status={item.status}
          >
            {item.content}
          </SettingsSection>
        ))}
        <h2 className="pt-2 text-xs font-semibold tracking-wide text-muted-foreground">
          {t("settingsFlow:accountAndServices")}
        </h2>
        {additional.map(item => (
          <SettingsSection
            key={item.id}
            id={item.id}
            title={t(`settingsFlow:${item.title}`)}
            description={t(`settingsFlow:${item.description}`)}
            icon={item.icon}
            open={!!expanded[item.id]}
            onOpenChange={change(item.id)}
          >
            {item.content}
          </SettingsSection>
        ))}
        <SettingsSection
          id="advanced"
          title={t("settingsFlow:advancedTitle")}
          description={t("settingsFlow:advancedDescription")}
          icon={Settings2}
          open={!!expanded.advanced}
          onOpenChange={change("advanced")}
          status={
            state.hasUnsavedFalChanges ||
            state.hasUnsavedLlmChanges ||
            state.hasUnsavedWhisperChanges
              ? t("settingsFlow:unsaved")
              : undefined
          }
        >
          <p className="settings-scope">{t("settingsFlow:advancedScope")}</p>
          <div className="space-y-3 px-3 pb-4 sm:px-4">
            <SettingsSection
              id="model"
              title={t("settingsFlow:modelTitle")}
              description={t("settingsFlow:modelDescription")}
              icon={Brain}
              open={!!expanded.model}
              onOpenChange={change("model")}
              status={summary("model", state.hasUnsavedLlmChanges)}
            >
              {configuration(<ChatModelSettings {...state} />)}
            </SettingsSection>
            <SettingsSection
              id="image"
              title={t("settingsFlow:imageTitle")}
              description={t("settingsFlow:imageDescription")}
              icon={Settings2}
              open={!!expanded.image}
              onOpenChange={change("image")}
              status={summary("image", state.hasUnsavedFalChanges)}
            >
              {configuration(<ImageSettings {...state} />)}
            </SettingsSection>
            <SettingsSection
              id="transcription"
              title={t("settingsFlow:transcriptionTitle")}
              description={t("settingsFlow:transcriptionDescription")}
              icon={Volume2}
              open={!!expanded.transcription}
              onOpenChange={change("transcription")}
              status={summary("transcription", state.hasUnsavedWhisperChanges)}
            >
              {configuration(<TranscriptionSettings {...state} />)}
            </SettingsSection>
            <SettingsSection
              id="keys"
              title={t("settingsFlow:keysTitle")}
              description={t("settingsFlow:keysDescription")}
              icon={Settings2}
              open={!!expanded.keys}
              onOpenChange={change("keys")}
            >
              {configuration(
                <SavedProviderKeys
                  keys={state.apiConfig?.keys}
                  disabled={state.isSavingSection}
                />
              )}
            </SettingsSection>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
