import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CharacterPrompt } from "./CharacterPrompt";
import type { SetupController } from "./useSetupController";

/** 基础人物设定保持紧凑，自动整理的外貌描述可展开微调。 */
export function CharacterDetails({
  state,
  age,
  onAgeChange,
}: {
  state: SetupController;
  age: number;
  onAgeChange: (age: number) => void;
}) {
  const { t } = state;
  return (
    <div className="space-y-4">
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
          rows={2}
          required
        />
        <p className="text-xs text-muted-foreground">
          {t("setup:describeThePersonalityToShapeTheCompanionS")}
        </p>
      </div>
      <details className="creator-more-details">
        <summary>{t("creator:moreDetails")}</summary>
        <div className="grid gap-4 pt-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="appearance">{t("setup:appearance")}</Label>
            <Textarea
              id="appearance"
              placeholder={t("setup:forExampleLongFlowingHairASlimBuild")}
              value={state.appearance}
              onChange={e => state.setAppearance(e.target.value)}
              rows={2}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("setup:describeTheAppearanceUsedWhenGeneratingSelfies")}
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
            />
          </div>
          <div className="md:col-span-2">
            <CharacterPrompt {...state} />
          </div>
        </div>
      </details>
    </div>
  );
}
