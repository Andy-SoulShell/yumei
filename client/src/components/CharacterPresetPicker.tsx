/** 内置角色预设的画风筛选与受控选择界面。 */

import { useI18n } from "@/lib/i18n";
import { useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import type { CharacterPreset } from "@shared/discovery";

/** 展示内置预设并通过回调返回选择，选择 null 表示从零自定义。 */
export function CharacterPresetPicker({
  selectedId,
  onSelect,
  characters,
}: {
  characters: readonly CharacterPreset[];
  /** 当前选中预设标识，null 表示自定义角色。 */
  selectedId: string | null;
  /** 选择预设时返回完整资料；选择从零创建时返回 null。 */
  onSelect: (preset: CharacterPreset | null) => void;
}) {
  const { t } = useI18n();
  const [style, setStyle] = useState<"all" | CharacterPreset["style"]>("all");
  const [expanded, setExpanded] = useState(!selectedId);
  const [visibleCount, setVisibleCount] = useState(4);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = characters.find(preset => preset.id === selectedId);
  const closePicker = () => {
    setExpanded(false);
    requestAnimationFrame(() => {
      trigger.current?.focus({ preventScroll: true });
      trigger.current?.scrollIntoView({ block: "nearest" });
    });
  };
  const filtered = characters.filter(
    preset => style === "all" || preset.style === style
  );
  return (
    <section
      className="space-y-4"
      aria-label={t("characters:characterPresets")}
    >
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {selected && (
              <img
                src={selected.imageUrl}
                alt=""
                className="h-20 w-16 shrink-0 rounded-xl object-cover object-[50%_20%]"
              />
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-medium break-words">
                {selected?.name || t("setup:chooseAppearance")}
              </h2>
              {selected && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {selected.label}
                </p>
              )}
            </div>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              ref={trigger}
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 shrink-0"
            >
              {expanded ? t("common:close2") : t("setup:change")}
              {expanded ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="space-y-4 pt-3">
          <RadioGroup
            value={style}
            onValueChange={value => {
              setStyle(value as typeof style);
              setVisibleCount(4);
            }}
            className="flex flex-wrap gap-2"
            aria-label={t("characters:characterStyle")}
          >
            {(
              [
                ["all", t("characters:allCount", { count: characters.length })],
                ["realistic", t("characters:realistic")],
                ["anime", t("characters:anime")],
              ] as const
            ).map(([value, label]) => (
              <RadioGroupChoice
                variant="segment"
                key={value}
                value={value}
                className="min-h-11 px-3 text-sm"
              >
                {label}
              </RadioGroupChoice>
            ))}
          </RadioGroup>
          <RadioGroup
            aria-label={t("characters:characterPresets")}
            value={selectedId ?? "custom"}
            onValueChange={id => {
              onSelect(characters.find(preset => preset.id === id) ?? null);
              closePicker();
            }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {filtered.slice(0, visibleCount).map(preset => (
                <RadioGroupChoice
                  key={preset.id}
                  value={preset.id}
                  aria-label={t("characters:select", { name: preset.name })}
                  className={`relative overflow-hidden rounded-2xl text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${selectedId === preset.id ? "ring-2 ring-primary" : "bg-muted/30 hover:bg-muted/60"}`}
                >
                  <img
                    src={preset.imageUrl}
                    alt={preset.name}
                    loading="lazy"
                    className="w-full aspect-[4/3] object-cover object-[50%_20%]"
                  />
                  {selectedId === preset.id && (
                    <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                  <div className="p-2.5 space-y-1">
                    <p className="font-medium">
                      {preset.name}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {t("characters:age", { age: preset.age })}
                      </span>
                    </p>
                    <p className="text-xs text-primary">{preset.label}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {preset.tagline}
                    </p>
                  </div>
                </RadioGroupChoice>
              ))}
            </div>
            {filtered.length > visibleCount && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full"
                onClick={() => setVisibleCount(count => count + 8)}
              >
                {t("setup:morePresets", {
                  count: filtered.length - visibleCount,
                })}
                <ChevronDown />
              </Button>
            )}
            <RadioGroupChoice
              variant="segment"
              value="custom"
              className="min-h-11 w-full border-dashed"
              onClick={() => {
                if (!selectedId) closePicker();
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t("characters:createFromScratch")}
            </RadioGroupChoice>
          </RadioGroup>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
