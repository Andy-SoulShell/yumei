import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CharacterPrompt } from "./CharacterPrompt";
import type { SetupController } from "./useSetupController";

/** 创建与编辑共用的人物设定，支持继续修改图片选项生成的描述。 */
export function CharacterDetails({ state }: { state: SetupController }) {
  const { t } = state;
  return (
    <div className="space-y-6">
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
        <Label htmlFor="personality">{t("setup:personality")}</Label>
        <Textarea
          id="personality"
          placeholder={t(
            "setup:forExampleGentleThoughtfulAffectionateAndALittle"
          )}
          value={state.personality}
          onChange={e => state.setPersonality(e.target.value)}
          rows={4}
          required
        />
        <p className="text-xs text-muted-foreground">
          {t("setup:describeThePersonalityToShapeTheCompanionS")}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="appearance">{t("setup:appearance")}</Label>
        <Textarea
          id="appearance"
          placeholder={t("setup:forExampleLongFlowingHairASlimBuild")}
          value={state.appearance}
          onChange={e => state.setAppearance(e.target.value)}
          rows={4}
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
      <CharacterPrompt {...state} />
    </div>
  );
}
