import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import type { SetupController } from "./useSetupController";

type Props = Pick<
  SetupController,
  | "characterLimits"
  | "behavior"
  | "setBehavior"
  | "behaviorError"
  | "isPending"
  | "t"
>;

const controls = [
  {
    field: "expression",
    label: "setup:behaviorExpression",
    options: [
      ["warm", "setup:behaviorExpressionWarm"],
      ["direct", "setup:behaviorExpressionDirect"],
      ["playful", "setup:behaviorExpressionPlayful"],
      ["reserved", "setup:behaviorExpressionReserved"],
    ],
  },
  {
    field: "verbosity",
    label: "setup:behaviorVerbosity",
    options: [
      ["concise", "setup:behaviorVerbosityConcise"],
      ["balanced", "setup:behaviorVerbosityBalanced"],
      ["detailed", "setup:behaviorVerbosityDetailed"],
    ],
  },
  {
    field: "initiative",
    label: "setup:behaviorInitiative",
    options: [
      ["quiet", "setup:behaviorInitiativeQuiet"],
      ["balanced", "setup:behaviorInitiativeBalanced"],
      ["lively", "setup:behaviorInitiativeLively"],
    ],
  },
  {
    field: "relationshipPace",
    label: "setup:behaviorRelationshipPace",
    options: [
      ["gradual", "setup:behaviorRelationshipPaceGradual"],
      ["natural", "setup:behaviorRelationshipPaceNatural"],
    ],
  },
  {
    field: "emotionIntensity",
    label: "setup:behaviorEmotionIntensity",
    options: [
      ["gentle", "setup:behaviorEmotionIntensityGentle"],
      ["expressive", "setup:behaviorEmotionIntensityExpressive"],
    ],
  },
] as const;

/** 用普通表单定义角色表达方式和示例，不要求用户编写提示词。 */
export function BehaviorEditor({
  characterLimits,
  behavior,
  setBehavior,
  behaviorError,
  isPending,
  t,
}: Props) {
  if (!behavior || !characterLimits) return null;
  const invalidExamples = behavior.examples.map(
    example => !example.user.trim() || !example.assistant.trim()
  );
  const showError = behaviorError && invalidExamples.some(Boolean);

  return (
    <fieldset className="space-y-4 rounded-xl border p-4">
      <legend className="px-1 text-base font-medium">
        {t("setup:behaviorTitle")}
      </legend>
      <p className="text-sm text-muted-foreground">
        {t("setup:behaviorDescription")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {controls.map(control => (
          <div key={control.field} className="space-y-2">
            <Label htmlFor={`behavior-${control.field}`}>
              {t(control.label)}
            </Label>
            <Select
              value={behavior[control.field]}
              disabled={isPending}
              onValueChange={value => {
                if (control.options.some(([option]) => option === value))
                  setBehavior(previous => ({
                    ...previous,
                    [control.field]: value,
                  }));
              }}
            >
              <SelectTrigger id={`behavior-${control.field}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {control.options.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {t(label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="behavior-user-nickname">
          {t("setup:behaviorUserNickname")}
        </Label>
        <Input
          id="behavior-user-nickname"
          value={behavior.userNickname}
          maxLength={characterLimits.nickname}
          placeholder={t("setup:behaviorUserNicknamePlaceholder")}
          onChange={event =>
            setBehavior(previous => ({
              ...previous,
              userNickname: event.target.value,
            }))
          }
        />
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">{t("setup:behaviorExamples")}</h2>
          <p
            id="behavior-examples-help"
            className="text-xs text-muted-foreground"
          >
            {t("setup:behaviorExamplesHelp")}
          </p>
        </div>
        {showError && (
          <p
            id="behavior-examples-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {t("setup:behaviorExamplesIncomplete")}
          </p>
        )}
        {behavior.examples.map((example, index) => (
          <fieldset key={index} className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">
              {t("setup:behaviorExampleNumber", { number: index + 1 })}
            </legend>
            {(["user", "assistant"] as const).map(speaker => (
              <div key={speaker} className="space-y-2">
                <Label htmlFor={`behavior-example-${index}-${speaker}`}>
                  {t(
                    speaker === "user"
                      ? "setup:behaviorExampleUser"
                      : "setup:behaviorExampleAssistant"
                  )}
                </Label>
                <Textarea
                  id={`behavior-example-${index}-${speaker}`}
                  value={example[speaker]}
                  rows={2}
                  maxLength={characterLimits.exampleLength}
                  aria-invalid={showError && !example[speaker].trim()}
                  aria-describedby={
                    showError && invalidExamples[index]
                      ? "behavior-examples-help behavior-examples-error"
                      : "behavior-examples-help"
                  }
                  onChange={event =>
                    setBehavior(previous => ({
                      ...previous,
                      examples: previous.examples.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, [speaker]: event.target.value }
                          : item
                      ),
                    }))
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("setup:behaviorRemoveExampleNumber", {
                number: index + 1,
              })}
              onClick={() =>
                setBehavior(previous => ({
                  ...previous,
                  examples: previous.examples.filter(
                    (_, itemIndex) => itemIndex !== index
                  ),
                }))
              }
            >
              <Trash2 className="mr-2 size-4" aria-hidden="true" />
              {t("setup:behaviorRemoveExample")}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            isPending ||
            behavior.examples.length >= characterLimits.exampleCount
          }
          aria-describedby="behavior-examples-help"
          onClick={() =>
            setBehavior(previous =>
              previous.examples.length >= characterLimits.exampleCount
                ? previous
                : {
                    ...previous,
                    examples: [
                      ...previous.examples,
                      { user: "", assistant: "" },
                    ],
                  }
            )
          }
        >
          <Plus className="mr-2 size-4" aria-hidden="true" />
          {t("setup:behaviorAddExample")}
        </Button>
      </div>
    </fieldset>
  );
}
