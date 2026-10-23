/** 可先体验的六步角色设计器，最后交给既有的受保护创建表单保存与开启聊天。 */
import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useDiscovery } from "@/features/discovery/useDiscovery";
import { useProductConfig } from "@/features/product/useProductConfig";
import {
  formDraftKey,
  readFormDraft,
  writeFormDraft,
  removeFormDraft,
} from "@/lib/formDrafts";
import { loginUrl } from "@/lib/navigation";
import { PageError } from "@/components/PageError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { StaticMessageKey } from "@shared/i18n";
import type { CharacterDraft } from "@/features/setup/characterDraft";

const STEPS = [
  "style",
  "general",
  "face",
  "body",
  "details",
  "review",
] as const;
const OPTIONS = {
  hairColor: ["inherit", "black", "brown", "blonde", "silver"],
  eyeColor: ["inherit", "brown", "blue", "green"],
  hairStyle: ["inherit", "long", "short", "wavy", "ponytail"],
  bodyType: ["inherit", "slim", "athletic", "curvy", "average"],
  height: ["inherit", "petite", "average", "tall"],
  outfit: ["inherit", "casual", "elegant", "sporty", "fantasy"],
} as const;
type Attribute = keyof typeof OPTIONS;
type Draft = {
  step: number;
  style: "realistic" | "anime";
  presetId: string;
  age: string;
  name: string;
  details: string;
} & Record<Attribute, string>;
const empty: Draft = {
  step: 0,
  style: "realistic",
  presetId: "",
  age: "25",
  name: "",
  details: "",
  hairColor: "inherit",
  eyeColor: "inherit",
  hairStyle: "inherit",
  bodyType: "inherit",
  height: "inherit",
  outfit: "inherit",
};
function restore(key: string | null, search: string): Draft {
  const saved =
    readFormDraft(key) ??
    (new URLSearchParams(search).get("resume") === "1"
      ? readFormDraft(formDraftKey("guest", "creation-wizard"))
      : null);
  if (!saved)
    return {
      ...empty,
      presetId: new URLSearchParams(search).get("preset") ?? "",
    };
  const draft = { ...empty };
  for (const field of ["presetId", "age", "name", "details"] as const)
    if (typeof saved[field] === "string")
      draft[field] = saved[field].slice(0, 2000);
  if (saved.style === "anime") draft.style = "anime";
  if (
    Number.isInteger(saved.step) &&
    Number(saved.step) >= 0 &&
    Number(saved.step) < STEPS.length
  )
    draft.step = Number(saved.step);
  for (const field of Object.keys(OPTIONS) as Attribute[])
    if ((OPTIONS[field] as readonly string[]).includes(String(saved[field])))
      draft[field] = String(saved[field]);
  return draft;
}
export default function CreateCharacter() {
  const { user } = useAuth();
  return <Builder key={user?.id ?? "guest"} accountId={user?.id} />;
}
function Builder({ accountId }: { accountId?: string }) {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const search = useSearch();
  const discovery = useDiscovery();
  const policy = useProductConfig();
  const key = formDraftKey(accountId ?? "guest", "creation-wizard");
  const [draft, setDraft] = useState(() => restore(key, search));
  const [replaceDraft, setReplaceDraft] = useState(false);
  const billing = trpc.billing.getInfo.useQuery(undefined, {
    enabled: !!accountId,
  });
  const roles = trpc.girlfriend.list.useQuery(undefined, {
    enabled: !!accountId,
  });
  useEffect(() => {
    writeFormDraft(key, draft);
  }, [key, draft]);
  const update = <K extends keyof Draft>(field: K, value: Draft[K]) =>
    setDraft(old => ({ ...old, [field]: value }));
  if (discovery.error || policy.error)
    return (
      <PageError
        onRetry={() =>
          void Promise.all([discovery.refetch(), policy.refetch()])
        }
      />
    );
  if (!discovery.data || !policy.raw)
    return (
      <div role="status" className="p-8">
        {t("auth:working")}
      </div>
    );
  const characters = discovery.data.characters.filter(
    role => role.listed && role.style === draft.style
  );
  const selected =
    discovery.data.characters.find(
      role => role.listed && role.id === draft.presetId
    ) ?? characters[0];
  if (!selected)
    return (
      <PageError
        title={t("explore:emptyTitle")}
        onRetry={() => navigate("/explore")}
      />
    );
  const limit =
    billing.data?.mode === "none" ? null : billing.data?.limits.maxGirlfriends;
  const coinInfo = billing.data?.economy;
  const capacityReady = !!billing.data && !!roles.data;
  const remaining =
    limit == null ? null : Math.max(0, limit - (roles.data?.length ?? 0));
  const validAge =
    Number.isInteger(Number(draft.age)) &&
    Number(draft.age) >= 18 &&
    Number(draft.age) <= 120;
  const finish = (replace = false) => {
    if (!validAge) return;
    if (!accountId) {
      navigate(loginUrl("/create?resume=1"));
      return;
    }
    if (!capacityReady || remaining === 0) return;
    const target = formDraftKey(accountId, "character-new:" + selected.id);
    if (readFormDraft(target) && !replace) {
      setReplaceDraft(true);
      return;
    }
    const attributes = (Object.keys(OPTIONS) as Attribute[])
      .filter(field => draft[field] !== "inherit")
      .map(field => field + ": " + draft[field])
      .join("; ");
    const appearance = `${selected.appearance}\nAdult, ${draft.age} years old. ${attributes}${draft.details.trim() ? ". " + draft.details.trim() : ""}`;
    const value: CharacterDraft = {
      name: draft.name.trim() || selected.name,
      personality: selected.personality,
      appearance,
      interests: selected.interests,
      customPrompt: "",
      omnivoiceVoiceId: "",
      presetId: selected.id,
      pendingFiles: false,
      behavior: structuredClone(selected.behavior),
    };
    writeFormDraft(target, value);
    removeFormDraft(formDraftKey("guest", "creation-wizard"));
    navigate("/setup?preset=" + selected.id + "&builder=1");
  };
  const choices = (field: Attribute) => (
    <fieldset className="studio-builder-field">
      <legend className="mb-3 font-medium">{t(`studio:${field}`)}</legend>
      <div className="studio-choice-row">
        {OPTIONS[field].map(value => (
          <Button
            key={value}
            type="button"
            variant="plain"
            aria-pressed={draft[field] === value}
            onClick={() => update(field, value)}
          >
            {t(`studio:${value}` as StaticMessageKey)}
          </Button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="studio-builder">
      <nav className="studio-stepper" aria-label={t("studio:createTitle")}>
        {STEPS.map((step, i) => (
          <Button
            key={step}
            variant="plain"
            aria-current={draft.step === i ? "step" : undefined}
            disabled={
              i > draft.step + 1 || (draft.step === 1 && !validAge && i > 1)
            }
            onClick={() => update("step", i)}
          >
            <span>{i < draft.step ? <Check size={13} /> : i + 1}</span>
            {t(`studio:step_${step}`)}
          </Button>
        ))}
      </nav>
      <div className="studio-builder-layout">
        <div>
          <h1>
            {t(
              draft.step === 0
                ? "studio:createTitle"
                : `studio:step_${STEPS[draft.step]}`
            )}
          </h1>
          <p className="studio-builder-intro">
            {t(draft.step === 5 ? "studio:reviewHint" : "studio:createIntro")}
          </p>
          {coinInfo && (
            <p role="status" className="mb-4 text-sm">
              {t("economy:cost", { count: coinInfo.costs.character })} ·{" "}
              {t("economy:balance")}: {coinInfo.balance}{" "}
              <Link className="underline" href="/wallet">
                {t("economy:wallet")}
              </Link>
            </p>
          )}
          {accountId && (
            <div
              className="studio-capacity"
              role={billing.error || roles.error ? "alert" : "status"}
            >
              {billing.error || roles.error ? (
                <>
                  <p>{t("explore:capacityError")}</p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void Promise.all([billing.refetch(), roles.refetch()])
                    }
                  >
                    {t("explore:retry")}
                  </Button>
                </>
              ) : !capacityReady ? (
                t("explore:checkingCapacity")
              ) : remaining === 0 ? (
                <>
                  <p>{t("explore:characterCapacityFull", { count: limit! })}</p>
                  <Link
                    href="/characters"
                    className="inline-flex min-h-11 items-center underline"
                  >
                    {t("explore:manageRoles")}
                  </Link>
                </>
              ) : remaining === null ? (
                t("explore:characterCapacityUnlimited")
              ) : (
                t("explore:characterCapacityRemaining", { count: remaining })
              )}
            </div>
          )}
          {draft.step === 0 && (
            <div className="studio-builder-options">
              {(["realistic", "anime"] as const).map(style => (
                <Button
                  key={style}
                  variant="plain"
                  className="studio-look-option"
                  aria-pressed={draft.style === style}
                  onClick={() =>
                    setDraft(old => ({ ...old, style, presetId: "" }))
                  }
                >
                  <img
                    src={
                      discovery.data!.characters.find(
                        role => role.listed && role.style === style
                      )?.imageUrl
                    }
                    alt=""
                  />
                  <span>
                    {t(
                      style === "anime" ? "explore:anime" : "explore:realistic"
                    )}
                  </span>
                </Button>
              ))}
            </div>
          )}
          {draft.step === 1 && (
            <div className="studio-builder-fields">
              <label className="studio-builder-field">
                {t("setup:name")}
                <Input
                  value={draft.name}
                  maxLength={policy.raw.characters.limits.name}
                  placeholder={selected.name}
                  onChange={e => update("name", e.target.value)}
                />
              </label>
              <label className="studio-builder-field">
                {t("studio:age")}
                <Input
                  inputMode="numeric"
                  type="number"
                  min={18}
                  max={120}
                  value={draft.age}
                  onChange={e => update("age", e.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                {t("explore:disclosure")}
              </p>
            </div>
          )}
          {draft.step === 2 && (
            <div className="studio-builder-fields">
              {choices("hairColor")}
              {choices("hairStyle")}
              {choices("eyeColor")}
            </div>
          )}
          {draft.step === 3 && (
            <div className="studio-builder-fields">
              {choices("bodyType")}
              {choices("height")}
            </div>
          )}
          {draft.step === 4 && (
            <div className="studio-builder-fields">
              {choices("outfit")}
              <label className="studio-builder-field">
                {t("studio:customDetails")}
                <Textarea
                  rows={4}
                  value={draft.details}
                  maxLength={Math.max(
                    0,
                    Math.min(
                      1500,
                      policy.raw.characters.limits.appearance -
                        selected.appearance.length -
                        220
                    )
                  )}
                  onChange={e => update("details", e.target.value)}
                />
              </label>
            </div>
          )}
          {draft.step === 5 && (
            <div className="studio-builder-fields">
              <div className="studio-builder-options">
                {characters.map(role => (
                  <Button
                    key={role.id}
                    variant="plain"
                    className="studio-look-option"
                    aria-pressed={role.id === selected.id}
                    onClick={() => update("presetId", role.id)}
                  >
                    <img src={role.imageUrl} alt="" loading="lazy" />
                    <span>{role.name}</span>
                  </Button>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("studio:previewHint")}
              </p>
            </div>
          )}
          {replaceDraft && (
            <div role="alert" className="studio-inline-notice">
              <p>{t("setup:replaceDraftDescription")}</p>
              <Button variant="outline" onClick={() => setReplaceDraft(false)}>
                {t("common:cancel")}
              </Button>
              <Button onClick={() => finish(true)}>
                {t("studio:createContinue")}
              </Button>
            </div>
          )}
          <div className="studio-builder-actions">
            <Button
              variant="ghost"
              disabled={draft.step === 0}
              onClick={() => update("step", draft.step - 1)}
            >
              <ArrowLeft />
              {t("studio:previous")}
            </Button>
            <Button
              disabled={
                !validAge ||
                (!!accountId && remaining === 0) ||
                (draft.step === 5 && !!accountId && !capacityReady)
              }
              onClick={() =>
                draft.step === 5 ? finish() : update("step", draft.step + 1)
              }
            >
              {t(
                draft.step === 5
                  ? "studio:createContinue"
                  : draft.step === 0
                    ? "studio:start"
                    : "studio:next"
              )}
              <ArrowRight />
            </Button>
          </div>
          <Link
            href="/setup"
            className="mt-4 inline-flex min-h-11 items-center text-xs text-muted-foreground underline"
          >
            {t("studio:quickCreate")}
          </Link>
        </div>
        <aside
          className="studio-builder-preview"
          aria-label={t("studio:preview")}
        >
          <img src={selected.imageUrl} alt={selected.name} />
          <div>
            <h2>{draft.name || selected.name}</h2>
            <p>{selected.tagline}</p>
            <p>{t("studio:previewHint")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
