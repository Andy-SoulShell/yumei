import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { getCharacterPreset } from "@shared/characterPresets";
import { getCreatorTemplate } from "./creatorTemplates";
import { CharacterPromptPreview } from "./CharacterPrompt";
import type { Translator } from "@shared/i18n";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CharacterDetails } from "./CharacterDetails";
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
import "./creator.css";

const STEPS = [
  "styleStep",
  "templateStep",
  "lookStep",
  "bodyStep",
  "detailsStep",
  "imageStep",
] as const;
const LOOK = ["ethnicity", "skin", "eyes", "hair", "hairstyle"] as const;
type Attribute = (typeof LOOK)[number] | "bodytype" | "breast" | "butt";

function ImageChoices({
  label,
  options,
  value,
  onChange,
  t,
  wide = false,
}: {
  label: string;
  options: CreatorOption[];
  value?: string;
  onChange: (option: CreatorOption) => void;
  t: Translator;
  wide?: boolean;
}) {
  if (!options.length) return null;
  return (
    <RadioGroup
      aria-label={label}
      value={value ?? ""}
      onValueChange={id => {
        const option = options.find(item => item.id === id);
        if (option) onChange(option);
      }}
      className={cn("creator-choices", wide && "is-wide")}
      data-count={options.length}
    >
      {options.map(option => (
        <RadioGroupChoice
          key={option.id}
          value={option.id}
          aria-label={creatorLabel(option.id, t)}
          className="creator-choice"
          onClick={() => {
            if (value === option.id) onChange(option);
          }}
        >
          <img
            src={option.imageUrl}
            alt={creatorLabel(option.id, t)}
            width={512}
            height={800}
          />
          <span className="creator-choice-label">
            {creatorLabel(option.id, t)}
          </span>
          {value === option.id && (
            <span className="creator-check" aria-hidden="true">
              <Check size={13} />
            </span>
          )}
        </RadioGroupChoice>
      ))}
    </RadioGroup>
  );
}
/** 图片只解释偏好标签；新角色形象由文字设定独立生成。 */
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
  const [furthest, setFurthest] = useState(preset ? 4 : 0);
  const [attribute, setAttribute] = useState<Attribute>("ethnicity");
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusAfterAdvance = useRef(false);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAutoAdvance = () => {
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    autoAdvanceRef.current = null;
  };
  useEffect(
    () => () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    },
    []
  );
  const attributes: readonly Attribute[] =
    step === 2
      ? LOOK
      : step === 3
        ? selection.gender === "female"
          ? ["bodytype", "breast", "butt"]
          : ["bodytype"]
        : [];
  const currentAttribute = attributes.includes(attribute)
    ? attribute
    : attributes[0];
  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 });
    if (focusAfterAdvance.current) {
      titleRef.current?.focus({ preventScroll: true });
      focusAfterAdvance.current = false;
    }
  }, [step, currentAttribute]);
  const updateSelection = (next: CreatorSelection) => {
    setSelection(next);
    state.setAppearance(describeCreator(next, t));
  };
  const changeBranch = (gender: CreatorGender, style: CreatorStyle) => {
    updateSelection(changeCreatorBranch(selection, gender, style));
    if (gender !== selection.gender || style !== selection.style) {
      state.setName("");
      state.setPersonality("");
      state.setInterests("");
      state.clearProfileUndo();
    }
  };
  const goTo = (next: number) => {
    cancelAutoAdvance();
    setStep(next);
    setFurthest(current => Math.max(current, next));
    setAttribute(next === 3 ? "bodytype" : "ethnicity");
  };
  const nextStep = (nextSelection = selection) => {
    if (step === 3) {
      if (!state.appearance.trim())
        state.setAppearance(describeCreator(nextSelection, t));
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
    goTo(Math.min(step + 1, 5));
  };
  const previous = () => {
    goTo(step - 1);
  };
  const advanceAfterChoice = (nextSelection: CreatorSelection) => {
    cancelAutoAdvance();
    autoAdvanceRef.current = setTimeout(() => {
      autoAdvanceRef.current = null;
      focusAfterAdvance.current = true;
      const index = attributes.indexOf(currentAttribute);
      if (index >= 0 && index < attributes.length - 1)
        setAttribute(attributes[index + 1]);
      else nextStep(nextSelection);
    }, 220);
  };
  const pickColor = (category: keyof typeof CREATOR_COLORS, value: string) => {
    const next = {
      ...selection,
      options: { ...selection.options, [category]: value },
    };
    updateSelection(next);
    advanceAfterChoice(next);
  };
  const pickOption = (category: CreatorCategory, option: CreatorOption) => {
    if (category === "templates") {
      const template = getCreatorTemplate(option.id);
      if (!template) return;
      updateSelection({
        ...template.selection,
        options: { ...template.selection.options },
      });
      state.setName(template.name);
      state.setPersonality(template.personality);
      state.setInterests(template.interests);
      state.clearProfileUndo();
      goTo(2);
      focusAfterAdvance.current = true;
      return;
    }
    const next = {
      ...selection,
      options: { ...selection.options, [category]: option.id },
    };
    updateSelection(next);
    advanceAfterChoice(next);
  };
  const startFromScratch = () => {
    updateSelection({ ...selection, options: {}, details: undefined });
    state.setName("");
    state.setPersonality("");
    state.setInterests("");
    state.clearProfileUndo();
    goTo(2);
  };
  const tags = [
    t(`creator:${selection.gender}`),
    t(`characters:${selection.style}`),
    ...Object.values(selection.options).map(value => creatorLabel(value, t)),
  ];
  const templates = creatorOptions(
    selection.gender,
    selection.style,
    "templates"
  );
  const colorCategory =
    currentAttribute && currentAttribute in CREATOR_COLORS
      ? (currentAttribute as keyof typeof CREATOR_COLORS)
      : null;
  const title = currentAttribute
    ? t(`creator:${currentAttribute}`)
    : t(`creator:${STEPS[step]}`);
  return (
    <div className="creator-page">
      <header className="creator-header">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("setup:back")}
          disabled={state.isPending}
          onClick={() => state.setLocation("/characters")}
        >
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1>{t("creator:title")}</h1>
          <p>{t("creator:subtitle")}</p>
        </div>
        <span className="creator-step-count">
          {String(step + 1).padStart(2, "0")} / 06
        </span>
      </header>
      <form
        noValidate
        className="creator-workspace"
        onSubmit={event => {
          if (step !== 5) {
            event.preventDefault();
            nextStep();
          } else void state.handleSubmit(event);
        }}
      >
        <nav className="creator-steps" aria-label={t("creator:title")}>
          {STEPS.map((id, index) => (
            <button
              key={id}
              type="button"
              disabled={index > furthest || state.isPending}
              aria-current={step === index ? "step" : undefined}
              onClick={() => goTo(index)}
            >
              <span className="creator-step-number" aria-hidden="true">
                {index < step ? <Check size={14} /> : index + 1}
              </span>
              <span>{t(`creator:${id}`)}</span>
            </button>
          ))}
        </nav>
        <section className="creator-stage" aria-label={title}>
          <div className="creator-stage-header">
            <h2 ref={titleRef} tabIndex={-1} aria-live="polite">
              {title}
            </h2>
            {step === 1 ? (
              <div className="creator-template-start">
                <p>
                  {templates.length
                    ? t("creator:templatesHint")
                    : t("creator:noTemplates")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={state.isPending}
                  onClick={startFromScratch}
                >
                  {t("creator:custom")}
                  <ArrowRight size={15} />
                </Button>
              </div>
            ) : (
              <p>
                {step === 5
                  ? t("creator:generationHint")
                  : t("creator:choiceHint")}
              </p>
            )}
          </div>
          {attributes.length > 0 && (
            <div
              className="creator-attributes"
              role="tablist"
              aria-label={t(`creator:${STEPS[step]}`)}
            >
              {attributes.map(category => (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  id={`tab-${category}`}
                  aria-controls="creator-options"
                  aria-selected={category === currentAttribute}
                  disabled={state.isPending}
                  onClick={() => {
                    cancelAutoAdvance();
                    setAttribute(category);
                  }}
                >
                  {t(`creator:${category}`)}
                  {selection.options[category] && (
                    <Check size={12} aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="creator-stage-content" ref={contentRef}>
            <fieldset disabled={state.isPending} className="creator-fieldset">
              <legend className="sr-only">{title}</legend>
              {step === 0 && (
                <div className="creator-style">
                  <RadioGroup
                    aria-label={t("creator:gender")}
                    value={selection.gender}
                    onValueChange={value =>
                      changeBranch(value as CreatorGender, selection.style)
                    }
                    className="grid grid-cols-2 max-w-xs gap-2"
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
                    key={`style-${selection.gender}`}
                    label={t("creator:styleStep")}
                    options={(["realistic", "anime"] as const).flatMap(style =>
                      creatorOptions(selection.gender, style, "style")
                    )}
                    value={`${selection.style}-${selection.gender}`}
                    onChange={option => {
                      changeBranch(
                        selection.gender,
                        option.id.startsWith("anime") ? "anime" : "realistic"
                      );
                      goTo(1);
                      focusAfterAdvance.current = true;
                    }}
                    t={t}
                    wide
                  />
                </div>
              )}
              {step === 1 && (
                <ImageChoices
                  label={t("creator:templateStep")}
                  options={templates}
                  value={selection.options.templates}
                  onChange={option => pickOption("templates", option)}
                  t={t}
                />
              )}
              {(step === 2 || step === 3) && (
                <div
                  id="creator-options"
                  role="tabpanel"
                  aria-labelledby={`tab-${currentAttribute}`}
                >
                  {colorCategory ? (
                    <RadioGroup
                      aria-label={title}
                      value={selection.options[colorCategory] ?? ""}
                      onValueChange={value => pickColor(colorCategory, value)}
                      className="creator-colors"
                    >
                      {CREATOR_COLORS[colorCategory].map(color => (
                        <RadioGroupChoice
                          key={color.id}
                          value={color.id}
                          aria-label={creatorLabel(color.id, t)}
                          className="creator-color"
                          onClick={() => {
                            if (selection.options[colorCategory] === color.id)
                              pickColor(colorCategory, color.id);
                          }}
                        >
                          <span
                            style={{ backgroundColor: color.color }}
                            aria-hidden="true"
                          />
                          {creatorLabel(color.id, t)}
                          {selection.options[colorCategory] === color.id && (
                            <Check size={14} />
                          )}
                        </RadioGroupChoice>
                      ))}
                    </RadioGroup>
                  ) : (
                    <ImageChoices
                      key={currentAttribute}
                      label={title}
                      options={creatorOptions(
                        selection.gender,
                        selection.style,
                        currentAttribute as CreatorCategory
                      )}
                      value={selection.options[currentAttribute]}
                      onChange={option =>
                        pickOption(currentAttribute as CreatorCategory, option)
                      }
                      t={t}
                    />
                  )}
                </div>
              )}
              {step === 4 && (
                <div className="creator-details">
                  <CharacterDetails
                    state={state}
                    age={selection.age}
                    onAgeChange={age => updateSelection({ ...selection, age })}
                    onGenerate={mode =>
                      void state.generateProfile(mode, selection)
                    }
                  />
                </div>
              )}
              {step === 5 && (
                <div className="creator-review">
                  <div
                    className="creator-portrait-placeholder"
                    aria-hidden="true"
                  >
                    <UserRound size={56} strokeWidth={1} />
                    <Sparkles size={20} />
                  </div>
                  <h3>{state.name}</h3>
                  <p className="creator-generation-copy">
                    {t("creator:generationHint")}
                  </p>
                  <dl>
                    <div>
                      <dt>{t("setup:personality")}</dt>
                      <dd>{state.personality}</dd>
                    </div>
                    <div>
                      <dt>{t("setup:appearance")}</dt>
                      <dd>{state.appearance}</dd>
                    </div>
                    {state.interests && (
                      <div>
                        <dt>{t("setup:interestsOptional")}</dt>
                        <dd>{state.interests}</dd>
                      </div>
                    )}
                  </dl>
                  <CharacterPromptPreview {...state} includePortrait />
                  {state.isPending && (
                    <p role="status" className="creator-generating">
                      <Loader2 size={16} className="animate-spin" />
                      {t("creator:generating")}
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          </div>
        </section>
        <aside className="creator-summary" aria-label={t("creator:review")}>
          <div className="creator-summary-icon" aria-hidden="true">
            <Sparkles size={22} />
          </div>
          <h2>{state.name || t("creator:yourCompanion")}</h2>
          <p>{t("creator:summaryHint")}</p>
          <div className="creator-tags">
            {tags.map((tag, index) => (
              <span key={`${index}-${tag}`}>{tag}</span>
            ))}
          </div>
          <div className="creator-summary-note">
            <UserRound size={16} />
            <p>{t("creator:choiceHint")}</p>
          </div>
        </aside>
        <footer className="creator-footer">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0 || state.isPending}
            onClick={previous}
          >
            <ArrowLeft size={16} />
            {t("creator:previous")}
          </Button>
          <span className="creator-footer-hint">
            {step === 2 || step === 3
              ? t("creator:autoAdvanceHint")
              : t("creator:autoSaveHint")}
          </span>
          {step < 5 ? (
            <Button
              key="continue"
              type="button"
              disabled={state.isPending}
              onClick={event => {
                event.preventDefault();
                nextStep();
              }}
            >
              {t("creator:next")}
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button key="create" type="submit" disabled={state.isPending}>
              {state.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}{" "}
              {state.isPending ? t("creator:generating") : t("creator:create")}
            </Button>
          )}
        </footer>
      </form>
    </div>
  );
}
