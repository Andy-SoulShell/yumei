import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CharacterPrompt } from "./CharacterPrompt";
import type { SetupController } from "./useSetupController";
import { Button } from "@/components/ui/button";
import { Loader2, Shuffle, Sparkles, Undo2 } from "lucide-react";

/** 基础人物设定保持紧凑，自动整理的外貌描述可展开微调。 */
export function CharacterDetails({
  state,
  age,
  onAgeChange,
  onGenerate,
}: {
  state: SetupController;
  age: number;
  onAgeChange: (age: number) => void;
  onGenerate: (mode: "polish" | "random") => void;
}) {
  const { t } = state;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onGenerate("random")}
          >
            {state.profileGenerationMode === "random" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Shuffle className="size-4" />
            )}
            {t("creator:randomProfile")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onGenerate("polish")}
          >
            {state.profileGenerationMode === "polish" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {t("creator:polishProfile")}
          </Button>
          {state.canUndoProfile && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={state.undoProfile}
            >
              <Undo2 className="size-4" />
              {t("creator:undoProfile")}
            </Button>
          )}
        </div>
        <p
          className="text-xs text-muted-foreground"
          role={state.profileGenerationMode ? "status" : undefined}
        >
          {state.profileGenerationMode
            ? t("creator:profileGenerating")
            : t("creator:profileAiHint")}
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("setup:name")}</Label>
          <Input
            id="name"
            placeholder={t("setup:forExampleYumi")}
            value={state.name}
            onChange={e => state.setName(e.target.value)}
            required
            maxLength={100}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="creator-age">{t("creator:age")}</Label>
          <Input
            id="creator-age"
            type="number"
            min={18}
            max={100}
            value={age}
            onChange={event =>
              onAgeChange(
                Math.max(18, Math.min(100, Number(event.target.value) || 18))
              )
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="personality">{t("setup:personality")}</Label>
        <Textarea
          id="personality"
          placeholder={t(
            "setup:forExampleGentleThoughtfulAffectionateAndALittle"
          )}
          value={state.personality}
          onChange={e => state.setPersonality(e.target.value)}
          rows={4}
          maxLength={2000}
          required
        />
        <p className="text-xs text-muted-foreground">
          {t("setup:describeThePersonalityToShapeTheCompanionS")}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="interests">{t("setup:interestsOptional")}</Label>
        <Textarea
          id="interests"
          placeholder={t("setup:forExampleMoviesMusicTravelAndFood")}
          value={state.interests}
          onChange={e => state.setInterests(e.target.value)}
          rows={2}
          maxLength={1000}
        />
      </div>
      <details className="creator-more-details">
        <summary>{t("creator:moreDetails")}</summary>
        <div className="grid gap-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="appearance">{t("setup:appearance")}</Label>
            <Textarea
              id="appearance"
              placeholder={t("setup:forExampleLongFlowingHairASlimBuild")}
              value={state.appearance}
              onChange={e => state.setAppearance(e.target.value)}
              rows={2}
              maxLength={6000}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("setup:describeTheAppearanceUsedWhenGeneratingSelfies")}
            </p>
          </div>
          <div>
            <CharacterPrompt {...state} />
          </div>
        </div>
      </details>
    </div>
  );
}
