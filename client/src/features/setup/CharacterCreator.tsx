import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { getCharacterPreset } from "@shared/characterPresets";
import type { Translator } from "@shared/i18n";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CharacterDetails } from "./CharacterDetails";
import { ReferenceUpload } from "./ReferenceUpload";
import {
  CREATOR_COLORS,
  type CreatorCategory,
  type CreatorGender,
  type CreatorOption,
  type CreatorStyle,
} from "./creatorAssets";
import {
  changeCreatorBranch,
  creatorLabel,
  creatorOptions,
  describeCreator,
  type CreatorSelection,
} from "./creatorOptions";
import type { SetupController } from "./useSetupController";

const STEPS = [
  "styleStep",
  "templateStep",
  "lookStep",
  "bodyStep",
  "detailsStep",
  "imageStep",
] as const;

function ImageChoices({
  label,
  options,
  value,
  onChange,
  t,
}: {
  label: string;
  options: CreatorOption[];
  value?: string;
  onChange: (option: CreatorOption) => void;
  t: Translator;
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={value ?? ""}
      onValueChange={id => {
        const option = options.find(option => option.id === id);
        if (option) onChange(option);
      }}
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5",
        options.length <= 2 && "sm:grid-cols-2 lg:grid-cols-2",
        options.length === 6 && "lg:grid-cols-3"
      )}
    >
      {options.map(option => (
        <RadioGroupChoice
          key={option.id}
          value={option.id}
          aria-label={creatorLabel(option.id, t)}
          className="group relative overflow-hidden rounded-xl bg-muted/30 data-[state=checked]:ring-2 data-[state=checked]:ring-primary"
        >
          <img
            src={option.imageUrl}
            alt={creatorLabel(option.id, t)}
            width={512}
            height={800}
            loading="lazy"
            className="aspect-[512/800] h-auto w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
          />
          {value === option.id && (
            <span
              aria-hidden="true"
              className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground"
            >
              <Check className="size-3.5" />
            </span>
          )}
          <span className="relative block bg-card p-2.5 text-center text-sm font-medium">
            {creatorLabel(option.id, t)}
          </span>
        </RadioGroupChoice>
      ))}
    </RadioGroup>
  );
}

/** 视觉选项负责外貌，人物资料与参考图继续复用现有创建流程。 */
export function CharacterCreator({ state }: { state: SetupController }) {
  const { t } = state;
  const preset = state.presetId
    ? getCharacterPreset(state.presetId)
    : undefined;
  const [selection, setSelection] = useState<CreatorSelection>({
    gender: "female",
    style: preset?.style ?? "realistic",
    age: preset?.age ?? 22,
    options: {},
  });
  const [step, setStep] = useState(preset ? 4 : 0);
  const [furthestStep, setFurthestStep] = useState(preset ? 4 : 0);
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pageRef.current?.closest("main")?.scrollTo?.({ top: 0, behavior: "auto" });
  }, [step]);

  const updateSelection = (next: CreatorSelection) => {
    setSelection(next);
    state.setAppearance(describeCreator(next, t));
  };
  const changeBranch = (gender: CreatorGender, style: CreatorStyle) => {
    updateSelection(changeCreatorBranch(selection, gender, style));
    state.handleSelectReference(
      `/character-options/creator/style/${style}-${gender}.webp`
    );
  };
  const goTo = (next: number) => {
    setStep(next);
    setFurthestStep(current => Math.max(current, next));
  };
  const nextStep = () => {
    if (step === 3) {
      if (!state.appearance.trim())
        state.setAppearance(describeCreator(selection, t));
      if (!state.personality.trim())
        state.setPersonality(t("creator:defaultPersonality"));
    }
    if (
      step === 4 &&
      (!state.name.trim() ||
        !state.personality.trim() ||
        !state.appearance.trim())
    ) {
      toast.error(t("setup:fillInAllRequiredFields"));
      return;
    }
    goTo(Math.min(step + 1, STEPS.length - 1));
  };
  const pickOption = (category: CreatorCategory, option: CreatorOption) => {
    updateSelection({
      ...selection,
      options: { ...selection.options, [category]: option.id },
    });
    if (category === "ethnicity" || category === "templates")
      state.handleSelectReference(option.imageUrl);
    if (category === "templates") {
      const previousTemplate = selection.options.templates;
      if (
        !state.name ||
        (previousTemplate && state.name === creatorLabel(previousTemplate, t))
      )
        state.setName(creatorLabel(option.id, t));
      goTo(2);
    }
  };
  const imageSection = (
    category: "ethnicity" | "hairstyle" | "bodytype" | "breast" | "butt"
  ) => (
    <section className="space-y-3" key={category}>
      <h2 className="text-base font-semibold">{t(`creator:${category}`)}</h2>
      <ImageChoices
        label={t(`creator:${category}`)}
        options={creatorOptions(selection.gender, selection.style, category)}
        value={selection.options[category]}
        onChange={option => pickOption(category, option)}
        t={t}
      />
    </section>
  );
  const templates = creatorOptions(
    selection.gender,
    selection.style,
    "templates"
  );
  const styleOptions = (["realistic", "anime"] as const).flatMap(style =>
    creatorOptions(selection.gender, style, "style")
  );

  return (
    <div
      ref={pageRef}
      className="min-h-full bg-background app-surface px-3 py-5 sm:px-6 sm:py-8"
    >
      <div className="mx-auto max-w-5xl">
        <Button
          variant="ghost"
          className="mb-4"
          disabled={state.isPending}
          onClick={() => state.setLocation("/characters")}
        >
          <ArrowLeft className="mr-2 size-4" />
          {t("setup:back")}
        </Button>
        <header className="mb-7 text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("creator:title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("creator:subtitle")}
          </p>
        </header>
        <nav
          aria-label={t("creator:title")}
          className="mb-7 grid grid-cols-6 gap-1 rounded-2xl border bg-card/70 p-2 sm:gap-2 sm:p-3"
        >
          {STEPS.map((id, index) => (
            <button
              key={id}
              type="button"
              disabled={index > furthestStep || state.isPending}
              aria-current={step === index ? "step" : undefined}
              onClick={() => setStep(index)}
              className={cn(
                "flex min-w-0 flex-col items-center gap-2 rounded-xl px-1 py-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40 sm:text-sm",
                step === index
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-xs",
                  step === index &&
                    "border-primary bg-primary text-primary-foreground"
                )}
              >
                {index < step ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="w-full break-words text-center leading-tight">
                {t(`creator:${id}`)}
              </span>
            </button>
          ))}
        </nav>
        <form
          noValidate
          onSubmit={event => {
            if (step !== 5) {
              event.preventDefault();
              nextStep();
            } else void state.handleSubmit(event);
          }}
          className="rounded-2xl border bg-card/70 p-4 shadow-sm sm:p-7"
        >
          <fieldset disabled={state.isPending} className="min-w-0 space-y-7">
            <legend className="sr-only">{t(`creator:${STEPS[step]}`)}</legend>
            {step === 0 && (
              <div className="mx-auto max-w-xl space-y-6">
                <RadioGroup
                  aria-label={t("creator:gender")}
                  value={selection.gender}
                  onValueChange={value =>
                    changeBranch(value as CreatorGender, selection.style)
                  }
                  className="mx-auto grid max-w-xs grid-cols-2"
                >
                  {(["female", "male"] as const).map(gender => (
                    <RadioGroupChoice
                      key={gender}
                      variant="segment"
                      value={gender}
                    >
                      {t(`creator:${gender}`)}
                    </RadioGroupChoice>
                  ))}
                </RadioGroup>
                <ImageChoices
                  label={t("creator:styleStep")}
                  options={styleOptions}
                  value={`${selection.style}-${selection.gender}`}
                  onChange={option =>
                    changeBranch(
                      selection.gender,
                      option.id.startsWith("anime") ? "anime" : "realistic"
                    )
                  }
                  t={t}
                />
              </div>
            )}
            {step === 1 && (
              <div className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  {t("creator:templatesHint")}
                </p>
                {templates.length > 0 ? (
                  <ImageChoices
                    label={t("creator:templateStep")}
                    options={templates}
                    value={selection.options.templates}
                    onChange={option => pickOption("templates", option)}
                    t={t}
                  />
                ) : (
                  <p className="rounded-xl border border-dashed px-5 py-10 text-center text-muted-foreground">
                    {t("creator:noTemplates")}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const options = { ...selection.options };
                    delete options.templates;
                    updateSelection({ ...selection, options });
                    state.handleSelectReference(
                      `/character-options/creator/style/${selection.style}-${selection.gender}.webp`
                    );
                    goTo(2);
                  }}
                >
                  {t("creator:custom")}
                </Button>
              </div>
            )}
            {step === 2 && (
              <>
                {imageSection("ethnicity")}
                {(["skin", "eyes", "hair"] as const).map(category => (
                  <section className="space-y-3" key={category}>
                    <h2 className="text-base font-semibold">
                      {t(`creator:${category}`)}
                    </h2>
                    <RadioGroup
                      aria-label={t(`creator:${category}`)}
                      value={selection.options[category] ?? ""}
                      onValueChange={id =>
                        updateSelection({
                          ...selection,
                          options: { ...selection.options, [category]: id },
                        })
                      }
                      className="flex flex-wrap gap-2"
                    >
                      {CREATOR_COLORS[category].map(color => (
                        <RadioGroupChoice
                          key={color.id}
                          value={color.id}
                          aria-label={creatorLabel(color.id, t)}
                          className="flex items-center gap-2 px-3 py-2 text-xs data-[state=checked]:ring-1 data-[state=checked]:ring-primary"
                        >
                          <span
                            aria-hidden="true"
                            style={{ backgroundColor: color.color }}
                            className="size-5 rounded-full border border-black/15"
                          />
                          {creatorLabel(color.id, t)}
                        </RadioGroupChoice>
                      ))}
                    </RadioGroup>
                  </section>
                ))}
                {imageSection("hairstyle")}
              </>
            )}
            {step === 3 && (
              <>
                {imageSection("bodytype")}
                {selection.gender === "female" && (
                  <>
                    {imageSection("breast")}
                    {imageSection("butt")}
                  </>
                )}
              </>
            )}
            {step === 4 && (
              <div className="mx-auto max-w-2xl space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="creator-age">{t("creator:age")}</Label>
                  <Input
                    id="creator-age"
                    type="number"
                    min={18}
                    max={100}
                    value={selection.age}
                    onChange={event =>
                      updateSelection({
                        ...selection,
                        age: Math.max(
                          18,
                          Math.min(100, Number(event.target.value) || 18)
                        ),
                      })
                    }
                    className="max-w-28"
                  />
                </div>
                <CharacterDetails state={state} />
              </div>
            )}
            {step === 5 && (
              <div className="mx-auto max-w-2xl space-y-6">
                <ReferenceUpload {...state} />
                <p className="text-center text-sm text-muted-foreground">
                  {t("creator:referenceHint")}
                </p>
                <section
                  aria-label={t("creator:review")}
                  className="space-y-3 rounded-xl border bg-muted/30 p-4"
                >
                  <h2 className="font-semibold">{state.name}</h2>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {state.personality}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {state.appearance}
                  </p>
                  {state.interests && (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {state.interests}
                    </p>
                  )}
                </section>
              </div>
            )}
          </fieldset>
          <footer className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-7 flex items-center justify-between gap-3 rounded-b-2xl border-t bg-card/95 px-4 py-4 backdrop-blur sm:-mx-7 sm:-mb-7 sm:px-7">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0 || state.isPending}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft className="mr-2 size-4" />
              {t("creator:previous")}
            </Button>
            {step < 5 ? (
              <Button
                key="continue"
                type="button"
                onClick={event => {
                  event.preventDefault();
                  nextStep();
                }}
              >
                {t("creator:next")}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            ) : (
              <Button key="create" type="submit" disabled={state.isPending}>
                {state.isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                {state.isPreparingReference
                  ? t("creator:preparing")
                  : state.isPending
                    ? t("setup:creating")
                    : t("creator:create")}
              </Button>
            )}
          </footer>
        </form>
      </div>
    </div>
  );
}
